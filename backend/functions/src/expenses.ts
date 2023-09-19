import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { isDocIdObject, createPersistentDownloadUrl, getTrackingDoc, getAuthObject /*, isWeekReference, isPayrollWeek2, thisTimeNextWeekInTimeZone */ } from "./utilities";
// import { updateProfileTallies } from "./profiles";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { generateExpenseAttachmentArchive } from "./storage";
//import { utcToZonedTime } from "date-fns-tz";
//import { format, addDays, subMilliseconds, addMilliseconds } from "date-fns";
import * as _ from "lodash";
import { createSSHMySQLConnection2 } from "./sshMysql";
// import { loadSQLFileToString } from "./sqlQueries";
// import { RowDataPacket } from "mysql2";

//const EXACT_TIME_SEARCH = false; // WAS true, but turned to false because firestore suddently stopped matching "==" Javascript Date Objects
//const WITHIN_MSEC = 1;

// clean up expense attachments that are orphaned by deletion or update of
// corresponding expense document. Check if the filepath changed. If it did,
// either a new one was uploaded or there isn't one so delete the old file
export const cleanUpOrphanedAttachment = functions.firestore
  .document("Expenses/{expenseId}")
  .onWrite(async (
  change: functions.ChangeJson,
  context: functions.EventContext,
) =>{
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
});

/*
  If an expense is committed, add it to the expenses property of the
  ExpenseTracking document for the corresponding weekEnding. Update the profile
  tallies at the same time to account for any mileage claims.

  If an expense is manually uncommitted, remove it from the expenses property of
  the ExpenseTracking document for the corresponding weekEnding. Update the
  profile tallies at the same time to account for any mileage claims that were
  removed.
 */
export const updateExpenseTracking = functions.runWith({memory: "1GB", timeoutSeconds: 180}).firestore
  .document("Expenses/{expenseId}")
  .onWrite(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    const beforeCommitted: boolean = beforeData?.committed ?? false;
    const weekEnding: Date = beforeData?.committedWeekEnding?.toDate() ?? afterData?.committedWeekEnding?.toDate();
    if ( weekEnding === undefined ) {
      console.log(`failed to get weekEnding, terminating`);
      return;      
    }

    // Get the ExpenseTracking doc if it exists, otherwise create it.
    const expenseTrackingDocRef = await getTrackingDoc(weekEnding,"ExpenseTracking","weekEnding");

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
      // update the Time Off and mileage Tallies on the corresponding profile
      // 2022-10-12 this is now done in syncToSQL
      // try {
      //   await updateProfileTallies(afterData.uid);
      // } catch (error) {
      //   functions.logger.error(`Error on updateProfileTallies for user ${afterData.uid}: ${error}`)
      // }      
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

      // update the Time Off and mileage Tallies on the corresponding profile
      // update 2022-10-12 this is now done in syncToSQL
      // try {
      //   await updateProfileTallies(afterData.uid);
      // } catch (error) {
      //   functions.logger.error(`Error on updateProfileTallies for user ${afterData.uid}: ${error}`)
      // }      
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
    delete docData.rejectorId;
    delete docData.rejectorName;
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

export const submitExpense = functions.https.onCall(async (data: unknown, context: functions.https.CallableContext) => {
  // Validate the data or throw
  // use a User Defined Type Guard
  if (!isDocIdObject(data)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The provided data doesn't contain a document id"
    );
  }
  
  const db = admin.firestore();
  const expense = await db.collection("Expenses").doc(data.id).get();
  const uid = expense.get("uid");

  // check that caller owns the expense
  if (uid !== context.auth?.uid) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "You are not authorized to submit this expense"
    );
  }

  // check that a manager uid is on the expense
  const managerUid = expense.get("managerUid");
  if (managerUid === undefined) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The expense has no manager information"
    );
  }

  const managerProfile = await db.collection("Profiles").doc(managerUid).get();

  // check that the manager is a tapr
  if (managerProfile.get("customClaims")?.tapr !== true) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `${managerProfile.get("displayName")} is not a time approver`
    );
  }

  // check that the manager is accepting submissions
  if (managerProfile.get("doNotAcceptSubmissions") === true) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `${managerProfile.get("displayName")} is not accepting submissions`
    );
  }

  return db.collection("Expenses").doc(data.id).set(
    {
      submitted: true,
      submittedDate: admin.firestore.FieldValue.serverTimestamp(),
      approved: managerUid === context.auth?.uid,
      committed: false,
    },
    { merge: true }
  );
});

// Get the values from all of the documents in the ExpenseRates collection
// and return them as an array of objects. Authentication is not required
export const expenseRates = functions.https.onCall(async (data: unknown, context: functions.https.CallableContext) => {
  if (!context.auth) {
    // Throw an HttpsError so that the client gets the error details
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Caller must be authenticated"
    );
  }

  const db = admin.firestore();
  const result:Record<string, any> = {};
  const ratesSnapshot = await db.collection("ExpenseRates").get();
  ratesSnapshot.forEach(x => {
    result[x.id] = x.data();
  });
  return result;
});

/*
  Expenses MUST NEVER BE uncommitted, manually or otherwise, if they have
  a property exportInProgress set to true. This is a highly privileged 
  function that gets called by only permitted users and uses a transaction 
  that verifies no exportInProgress flag exists prior to unlocking. It then
  sets the exportInProgress flag and deletes any corresponding rows in 
  MySQL. Finally it unsets the exportInProgress flag.
*/
export const uncommitExpense = functions.https.onCall(async (data: unknown, context: functions.https.CallableContext) => {
  const collection = "Expenses";
  const lockProperty = "committed";
  // caller must have permission to run this
  getAuthObject(context, ["tsunlock"])

  // Validate the data or throw
  // use a User Defined Type Guard
  if (!isDocIdObject(data)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The provided data isn't a valid document reference"
    );
  }

  const db = admin.firestore();

  // create a flag which will be true if rows need to be deleted from MySQL
  // After the transaction if this flag is true we will continue with the 
  // DELETEs and then update the exported and exportInProgress flags on the 
  // document
  let deleteFromMySQL = false;
  const successBatch = db.batch();
  const failBatch = db.batch();

  // run transaction to read the document and if it exists check that it is
  // locked/committed and an export is not in progress. Then unlock/uncommit it.
  const doc = db.collection(collection).doc(data.id);
  await db.runTransaction(async (transaction) => {
    return transaction.get(doc).then(async (docSnap) => {
      const snapData = docSnap.data();
      if (!snapData) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `The ${collection} document is empty so cannot be unlocked`
        );
      }
      if (snapData[lockProperty] !== true) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `The ${collection} document can't be un${lockProperty} because it is not ${lockProperty}`
        );
      }
      if (snapData.exportInProgress === true) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `The ${collection} document can't be un${lockProperty} because it is` + 
          " currently being exported"
        );
      }
      // if exported is already true, set deleteFromMySQL=true to perform the
      // deletion next. Update the success and fail batches to run after the
      // deletion depending on the outcome.
      if (snapData.exported === true) {
        deleteFromMySQL = true;
        functions.logger.info(`${docSnap.id} will be un${lockProperty} after it is ` + 
          "deleted from the export destination.");
        successBatch.update(doc, { 
          exportInProgress: admin.firestore.FieldValue.delete(),
          [lockProperty]: false,
          exported: false,
        });
        failBatch.update(doc, { 
          exportInProgress: admin.firestore.FieldValue.delete(),
        });
        return transaction.update(doc, { exportInProgress: true });
      }
      
      // doc is unlockable, unlock it, exported flag is already false
      return transaction.update(doc, { [lockProperty]: false });
    });
  });

  if (deleteFromMySQL) {
    // Delete from MySQL then if successful run successBatch.commit()
    const mysqlConnection = await createSSHMySQLConnection2();
    try {
      await mysqlConnection.query(`DELETE FROM ${collection} WHERE id=?`, [doc.id]);
    } catch (error) {
      await failBatch.commit();
      throw new functions.https.HttpsError(
        "internal",
        `An error occured while deleting the ${collection} doc from the synced database`);
    }
    return successBatch.commit();
  }
  return;
});
