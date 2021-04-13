import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { isDocIdObject, isWeekReference, createPersistentDownloadUrl, contextHasClaim, isPayrollWeek2, thisTimeNextWeekInTimeZone } from "./utilities";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { generateExpenseAttachmentArchive } from "./storage";
import { utcToZonedTime } from "date-fns-tz";
import { format, addDays, subSeconds, addSeconds } from "date-fns";
import * as _ from "lodash";

const EXACT_TIME_SEARCH = false; // WAS true, but turned to false because firestore suddently stopped matching "==" Javascript Date Objects
const WITHIN_SECONDS = 2;

// onWrite()
// check if the filepath changed
// if it did, either a new one was uploaded or 
// there isn't one so delete the old file
export async function cleanUpOrphanedAttachment(
  change: functions.ChangeJson,
  context: functions.EventContext,
) {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    let beforeAttachment: string;
    let afterAttachment: string;

    if (beforeData) {
      // the Expense was updated or deleted
      beforeAttachment = beforeData.attachment;
      afterAttachment = afterData?.attachment ?? null;
      if (beforeAttachment !== afterAttachment) {
        // the attachment was changed so
        // delete the old attachment if it existed
        const bucket = admin.storage().bucket();
        if (beforeAttachment !== undefined) {
          const file = bucket.file(beforeAttachment);
          return file.delete();
        }
      }
      // No change was made to the attachment, do nothing
      return;
    }
    // document was just created, do nothing
    return;
}


/*
  If an expense is committed, add it to the expenses property of the 
  ExpenseTracking document for the corresponding weekEnding.

  If an expense is manually uncommitted, remove it from the expenses property 
  of the ExpenseTracking document for the corresponding weekEnding.
 */
export const updateExpenseTracking = functions.firestore
  .document("Expenses/{expenseId}")
  .onWrite(async (change, context) => {
    const db = admin.firestore();
    const beforeData = change.before.data();
    const afterData = change.after.data();
    const beforeCommitted: boolean = beforeData?.committed ?? false;
    const weekEnding: Date = beforeData?.committedWeekEnding?.toDate() ?? afterData?.committedWeekEnding?.toDate();
    if ( weekEnding === undefined ) {
      console.log(`failed to get weekEnding, terminating`);
      return;      
    }

    // Get the ExpenseTracking doc if it exists, otherwise create it.
    let querySnap;
    if (EXACT_TIME_SEARCH) {
      querySnap = await db
        .collection("ExpenseTracking")
        .where("weekEnding", "==", weekEnding)
        .get();
    } else {
      querySnap = await db
        .collection("ExpenseTracking")
        .where("weekEnding", ">", subSeconds(weekEnding, WITHIN_SECONDS))
        .where("weekEnding", "<", addSeconds(weekEnding, WITHIN_SECONDS))
        .get();
    }

    let expenseTrackingDocRef;
    if (querySnap.size > 1) {
      throw new Error(
        `There is more than one document in ExpenseTracking for weekEnding ${weekEnding}`
      );
    } else if (querySnap.size === 1) {
      // retrieve existing ExpenseTracking document
      expenseTrackingDocRef = querySnap.docs[0].ref;
    } else {
      // create new ExpenseTracking document
      expenseTrackingDocRef = db.collection("ExpenseTracking").doc();
      functions.logger.info(`creating new ExpenseTracking document ${expenseTrackingDocRef.id}`);
      await expenseTrackingDocRef.set({ weekEnding, created: admin.firestore.FieldValue.serverTimestamp() });
    }
    if (
      afterData &&
      afterData.committed === true &&
      afterData.approved === true
    ) {
      // add the committed Expense to expenses
      await expenseTrackingDocRef.update(
        {
          [`expenses.${change.after.ref.id}`]: { displayName: afterData.displayName, uid: afterData.uid, date: afterData.date },
        }
      );
    }
    if (
      afterData &&
      afterData.committed !== beforeCommitted &&
      afterData.committed === false &&
      afterData.approved === true
    ) {
      // remove the *manually* uncommitted Expense from expenses
      console.log(`Expense ${change.after.ref.id} has been manually uncommitted. Export must be run to update the reports`);
      await expenseTrackingDocRef.update(
        {
          [`expenses.${change.after.ref.id}`]: admin.firestore.FieldValue.delete(),
        }
      );
      // remove commitName, commitTime, commitUid, committedWeekEnding and
      // payPeriodEnding from Expense doc so it becomes a validExpenseEntry()
      // and can be rejected
      await change.after.ref.update({
        commitTime: admin.firestore.FieldValue.delete(),
        commitName: admin.firestore.FieldValue.delete(),
        commitUid: admin.firestore.FieldValue.delete(),
        committedWeekEnding: admin.firestore.FieldValue.delete(),
        payPeriodEnding: admin.firestore.FieldValue.delete(),
      });
    }
    await exportJson({ id: expenseTrackingDocRef.id });
    return generateExpenseAttachmentArchive({ id: expenseTrackingDocRef.id });
  });

// Given an ExpenseTracking id, create or update a file on Google storage
// with the committed expenses. Must be called by another
// authenticated function.
export async function exportJson(data: unknown) {
  // Get locked TimeSheets
  const db = admin.firestore();

  // Validate the data or throw
  // use a User Defined Type Guard
  if (!isDocIdObject(data)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The provided data doesn't contain a document id"
    );
  }

  const trackingSnapshot = await db
    .collection("ExpenseTracking")
    .doc(data.id)
    .get();

  const expensesSnapshot = await db
    .collection("Expenses")
    .where("approved", "==", true)
    .where("committed", "==", true)
    .where("committedWeekEnding", "==", trackingSnapshot.get("weekEnding"))
    .get();

  // delete internal properties for each expense
  const expenses = expensesSnapshot.docs.map((doc) => {
    const docData = doc.data();
    delete docData.submitted;
    delete docData.approved;
    delete docData.committed;
    delete docData.rejected;
    delete docData.rejectionReason;
    docData.date = docData.date.toDate();
    docData.commitTime = docData.commitTime.toDate();
    docData.committedWeekEnding = docData.committedWeekEnding.toDate();
    docData.payPeriodEnding = docData.payPeriodEnding.toDate();
    return docData;
  });
  
  // generate JSON output
  const output = JSON.stringify(expenses);
  
  // make the filename based on milliseconds since UTC epoch
  const filename = `${trackingSnapshot
    .get("weekEnding")
    .toDate()
    .getTime()}.json`;
  const tempLocalFileName = path.join(os.tmpdir(), filename);

  return new Promise<void>((resolve, reject) => {
    //write contents of json into the temp file
    fs.writeFile(tempLocalFileName, output, (error) => {
      if (error) {
        reject(error);
        return;
      }

      const bucket = admin.storage().bucket();
      const destination = "ExpenseTrackingExports/" + filename;
      const newToken = uuidv4();

      // upload the file into the current firebase project default bucket
      bucket
        .upload(tempLocalFileName, {
          destination,
          // Workaround: firebase console not generating token for files
          // uploaded via Firebase Admin SDK
          // https://github.com/firebase/firebase-admin-node/issues/694
          metadata: {
            metadata: {
              firebaseStorageDownloadTokens: newToken,
            },
          },
        })
        .then(async (uploadResponse) => {
          // put the path to the new file into the TimeTracking document
          await trackingSnapshot.ref.update({
            json: createPersistentDownloadUrl(
              admin.storage().bucket().name,
              destination,
              newToken
            ),
          });
          return resolve();
        })
        .catch((err) => reject(err));
    });
  });
};

export async function getPayPeriodExpenses(
    data: unknown, 
    context: functions.https.CallableContext
): Promise<admin.firestore.DocumentData[]> {

  if (!contextHasClaim(context, "report")) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Call to getPayPeriodExpenses() failed"
    );
  }
  
  // Validate the data or throw
  // use a User Defined Type Guard
  if (!isWeekReference(data)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The provided data isn't a valid week reference"
    );
  }

  // Get argument
  const week2Ending = new Date(data.weekEnding);

  // Verify that the provided weekEnding is a payroll week 2
  // by ensuring an even week difference from a week epoch
  if (!isPayrollWeek2(week2Ending)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The week ending specified is not week 2 of a payroll period"
    )
  }

  /* 
  throw if the current datetime is before the end of the week following the 
  pay period because more expenses may still be committed. This allows
  adding and committing of expenses up to a full week following the end of
  the pay period to be paid out during that period
  */
  if (new Date() < thisTimeNextWeekInTimeZone(week2Ending, "America/Thunder_Bay")) {
    const tbay_week = utcToZonedTime(
      new Date(data.weekEnding),
      "America/Thunder_Bay"
    );  
    throw new functions.https.HttpsError(
      "invalid-argument",
      `Wait until ${format(addDays(tbay_week,8), "MMM dd")} to process expenses for pay period ending ${format(tbay_week, "MMM dd")}`
    )
  }

  /*
  pay periods are two weeks long. Expenses are reported in the week in 
  which they are committed. We will use all expenses commited in week2
  of the pay period, and all expenses committed in the week after whose
  date is before the end of the pay period. Because they will already have
  been paid out, we also must remove out any expense commited in week1 of
  the pay period whose date is before the beginning of the pay period.
  */
  const db = admin.firestore();

  const expensesSnapshot = await db.collection("Expenses")
    .where("committed", "==", true)
    .where("payPeriodEnding", "==", week2Ending)
    .get();

  const expenses = expensesSnapshot.docs.map((d: admin.firestore.QueryDocumentSnapshot): admin.firestore.DocumentData => { return d.data()});
  
  // convert commitTime, committedWeekEnding, and date to strings
  return expenses.map((e: admin.firestore.DocumentData): admin.firestore.DocumentData => {
    e.date = e.date.toDate().toString();
    e.commitTime = e.commitTime.toDate().toString();
    e.committedWeekEnding = e.committedWeekEnding.toDate().toString();
    e.payPeriodEnding = e.payPeriodEnding.toDate().toString();
    return e
  });
}