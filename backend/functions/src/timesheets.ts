/* 

This module exports callable handlers (functions.https.onCall(<handler_func>))
https://firebase.google.com/docs/functions/callable


Claims permissions: these should perhaps be in an array and simpler to get
below the 1000 byte limit

time: true 
The default. Holders of this claim can create TimeEntries, bundle and unbundle
their own TimeSheets, and submit them for approval

tapr: true
Holders of this claim can approve submitted timesheets whose 
managerUid field matches their uid.

tame: true
Holders of this claim can create time amendments and view approved timesheets

report: true
Holders of this claim can view reports and exports

*/
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { zonedTimeToUtc, utcToZonedTime } from "date-fns-tz";
import { format } from "date-fns";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getAuthObject, isWeekReference, TimeEntry, isDocIdObject, createPersistentDownloadUrl, TimeOffTypes } from "./utilities";

// Get the TimeTracking doc if it exists, otherwise create it.
async function getTimeTrackingDoc(weekEnding: Date) {
  const db = admin.firestore();

  // Get the TimeTracking doc if it exists, otherwise create it.
  const querySnap = await db
    .collection("TimeTracking")
    .where("weekEnding", "==", weekEnding)
    .get();

  let timeTrackingDocRef: admin.firestore.DocumentReference;
  if (querySnap.size > 1) {
    throw new Error(
      `There is more than one document in TimeTracking for weekEnding ${weekEnding}`
    );
  } else if (querySnap.size === 1) {
    // retrieve existing tracking document
    timeTrackingDocRef = querySnap.docs[0].ref;
  } else {
    // create new tracking document
    timeTrackingDocRef = db.collection("TimeTracking").doc();
    await timeTrackingDocRef.set({ weekEnding });
  }
  return timeTrackingDocRef;
}


interface PendingTimeSheetSummary {
  displayName: string;
  uid: string;
  offRotationDaysTally: number;
  hoursWorked: number;
  bankedHours: number;
  payoutRequest: number;
  OB?: number;
  OH?: number;
  OP?: number;
  OS?: number;
  OV?: number;
}

export async function unbundleTimesheet(
  data: unknown, 
  context: functions.https.CallableContext
) {
  const db = admin.firestore();

  // throws if the caller isn't authorized
  const auth = getAuthObject(context, ["time"]);

  // Validate the data or throw
  // use a User Defined Type Guard
  if (!isDocIdObject(data)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The provided data doesn't contain a document id"
    );
  }

  const timeSheet = await db.collection("TimeSheets").doc(data.id).get()

  const tsData = timeSheet.data()
  if (tsData === undefined) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `There is no matching TimeSheet document for id ${data.id}`
    )
  }

  if (tsData.uid !== auth.uid) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "A timesheet can only be unbundled by its owner"
    );
  }

  if (tsData.submitted === true) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "A submitted timesheet cannot be unbundled"
    );
  }

  if (tsData.approved === true) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "An approved timesheet cannot be unbundled"
    );
  }

  if (tsData.locked === true) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "A locked timesheet cannot be unbundled"
    );
  }

  console.log("TimeSheet found, creating a batch");
  // Start a write batch
  const batch = db.batch();

  // Create new TimeEntres for each entries item in the TimeSheet
  tsData.entries.forEach((timeEntry: TimeEntry) => {
    // timeEntry is of type "QueryDocumentSnapshot"
    // TODO: Possibly must add back redundant data removed in bundle
    const entry = db.collection("TimeEntries").doc();
    batch.set(entry, timeEntry);
  });

  // Delete the TimeSheet
  batch.delete(timeSheet.ref);
  return batch.commit();
};

/*
  If a timesheet is approved, make sure that it is included in the pending
  property of the TimeTracking document for the corresponding weekEnding.

  If a timesheet is manually unlocked, make sure that it is removed from the
  timeSheets property and added back to the pending property of the TimeTracking
  document for the corresponding weekEnding.
 */
export const updateTimeTracking = functions.firestore
  .document("TimeSheets/{timesheetId}")
  .onWrite(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    let beforeSubmitted: boolean;
    let beforeApproved: boolean;
    let beforeLocked: boolean;
    let weekEnding: Date;
    if (beforeData) {
      // the TimeSheet was updated
      beforeSubmitted = beforeData.submitted
      beforeApproved = beforeData.approved
      beforeLocked = beforeData.locked
      weekEnding = beforeData.weekEnding.toDate();
    }
    else if (afterData) {
      // the TimeSheet was just created
      beforeSubmitted = false;
      beforeApproved = false;
      beforeLocked = false;
      weekEnding = afterData.weekEnding.toDate();
    }
    else {
      // This should never happen because either a before or after document
      // must exist, but it is here because the if/else branch
      // above will not assign a value to beforeApproved or weekEnding in 
      // this case and TypeScript notices that
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Both the before and after DocumentSnapshots contain no data"
      );
    }

    const timeTrackingDocRef = await getTimeTrackingDoc(weekEnding);

    if (
      afterData &&
      afterData.submitted === beforeSubmitted &&
      afterData.submitted === true &&
      afterData.approved !== beforeApproved &&
      afterData.approved === true &&
      afterData.locked === false
    ) {
      // just approved
      // add summary of newly approved TimeSheet to pending, remove from submitted
      const pendingObj: PendingTimeSheetSummary = { 
        displayName: afterData.displayName, 
        uid: afterData.uid,
        offRotationDaysTally: afterData.offRotationDaysTally,
        hoursWorked: afterData.workHoursTally.jobHours + afterData.workHoursTally.hours,
        bankedHours: afterData.bankedHours,
        payoutRequest: afterData.payoutRequest,
      }
      // add nonWorkHoursTally props
      for (const key in afterData.nonWorkHoursTally) {
        pendingObj[key as TimeOffTypes] = afterData.nonWorkHoursTally[key];
      }

      return timeTrackingDocRef.update(
        {
          [`pending.${change.after.ref.id}`]: pendingObj,
          [`submitted.${change.after.ref.id}`]: admin.firestore.FieldValue.delete(),
        }
      );
    } else if (
      afterData &&
      afterData.locked !== beforeLocked &&
      afterData.locked === false &&
      afterData.approved === true
    ) {
      // just unlocked
      // remove the *manually* unlocked Time Sheet from timeSheets 
      // and add it to pending
      console.log(`TimeSheet ${change.after.ref.id} has been manually unlocked.`);
      await timeTrackingDocRef.update(
        {
          [`pending.${change.after.ref.id}`]: { displayName: afterData.displayName, uid: afterData.uid },
          [`timeSheets.${change.after.ref.id}`]: admin.firestore.FieldValue.delete(),
        }
      );
    } else if (
      afterData &&
      afterData.submitted !== beforeSubmitted &&
      afterData.submitted === true &&
      afterData.approved === false &&
      afterData.locked === false
    ) {
      // just submitted
      // add the document to submitted
      return timeTrackingDocRef.update(
        {
          [`submitted.${change.after.ref.id}`]: { displayName: afterData.displayName, uid: afterData.uid, managerName: afterData.managerName },
        }
      );
    } else if (
      afterData &&
      afterData.submitted !== beforeSubmitted &&
      afterData.submitted === false &&
      afterData.approved === false &&
      afterData.locked === false
    ) {
      // just recalled
      // remove the document from submitted
      return timeTrackingDocRef.update(
        {
          [`submitted.${change.after.ref.id}`]: admin.firestore.FieldValue.delete(),
        }
      );
    } else {
      // rejected or deleted or manually unapproved (without rejection)
      // remove the TimeSheet from pending
      return timeTrackingDocRef.update(
        {
          [`pending.${change.after.ref.id}`]: admin.firestore.FieldValue.delete(),
          [`submitted.${change.after.ref.id}`]: admin.firestore.FieldValue.delete(),
        },
      );
    }
    return exportJson({ id: timeTrackingDocRef.id });
  });

/*
  Given a document id, lock the corresponding approved TimeSheet document 
  then add it to the timeSheets property array of the TimeTracking doc. 
  Finally, call exportJson()
*/
export async function lockTimesheet(data: unknown, context: functions.https.CallableContext) {
  if (!contextHasClaim(context, "tslock")) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Call to lockTimesheet() failed"
    );
  }

  // Validate the data or throw
  // use a User Defined Type Guard
  if (!isDocIdObject(data)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The provided data isn't a valid document reference"
    );
  }

  // run transaction to read the timesheet and if it exists check that
  // it is approved and submitted. Then lock it and call exportJson()
  const db = admin.firestore();
  const timeSheet = await db.collection("TimeSheets").doc(data.id).get();
  const weekEnding = timeSheet.get("weekEnding");
  if (weekEnding === undefined) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The TimeSheet document is missing a weekEnding property"
    );
  }
  const timeTrackingDocRef = await getTimeTrackingDoc(weekEnding.toDate());
  await db.runTransaction(async (transaction) => {
    return transaction.get(timeSheet.ref).then(async (tsSnap) => {
      const snapData = tsSnap.data();
      if (!snapData) {
        throw new Error("The TimeSheet docsnap was empty during the locking transaction")
      }
      if (
        snapData.submitted === true &&
        snapData.approved === true &&
        snapData.locked === false
      ) {
        // timesheet is lockable, lock it then add it to the export
        return transaction
          .update(timeSheet.ref, { locked: true })
          .update(timeTrackingDocRef, {
            [`timeSheets.${tsSnap.id}`]: { displayName: snapData.displayName, uid: snapData.uid },
          });
      } else {
        throw new Error(
          "The timesheet has either not been submitted and approved " +
            "or it was already locked"
        );
      }
    });
  });
  return exportJson({ id: timeTrackingDocRef.id });
}
/*
  Given a weekEnding as a property of data, lock all of the currently
  approved TimeSheets and add their ids to the timeSheets property array
  of the TimeTracking doc. Finally, call exportJson()
*/
export async function lockTimesheets(data: unknown, context: functions.https.CallableContext) {
  if (!contextHasClaim(context, "tslock")) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Call to lockTimesheets() failed"
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

  const tbay_week = utcToZonedTime(
    new Date(data.weekEnding),
    "America/Thunder_Bay"
  );

  // Overwrite the time to 23:59:59.999 in America/Thunder_Bay time zone
  tbay_week.setHours(23, 59, 59, 999);

  // verify tbay_week is a Saturday in America/Thunder_Bay time zone
  if (tbay_week.getDay() !== 6) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The week ending specified is not a Saturday"
    );
  }

  // Convert back to UTC for queries against firestore
  const weekEnding = zonedTimeToUtc(new Date(tbay_week), "America/Thunder_Bay");

  // Look for TimeSheets to export
  const db = admin.firestore();
  const timeSheets = await db
    .collection("TimeSheets")
    .where("approved", "==", true)
    .where("locked", "==", false)
    .where("weekEnding", "==", weekEnding)
    .get();

  if (!timeSheets.empty) {
    /* TODO: for each Timesheet, run a transaction to verify
      that submitted & approved are true and that it isn't locked. Then lock it, 
      and add it as an array element to the timeSheets property of the export
      document that has week_ending.getTime() as ID. Create the export document
      if it doesn't already exist.
        
      The idea here is that at some point we can delete locked TimeSheets from
      the database as they're aggregated into TimeTracking. This assists in data
      management while preserving values for future use and reducing queries
    */

    const timeTrackingDocRef = await getTimeTrackingDoc(weekEnding);

    const transactions: Promise<admin.firestore.Transaction>[] = [];
    timeSheets.forEach((timeSheet) => {
      const trans = db.runTransaction(async (transaction) => {
        return transaction.get(timeSheet.ref).then(async (tsSnap) => {
          const snapData = tsSnap.data();
          if (!snapData) {
            throw new Error("A DocumentSnapshot was empty during the locking transaction")
          }
          if (
            snapData.submitted === true &&
            snapData.approved === true &&
            snapData.locked === false
          ) {
            // timesheet is lockable, lock it then add it to the export
            return transaction
              .update(timeSheet.ref, { locked: true })
              .update(timeTrackingDocRef, {
                [`timeSheets.${tsSnap.id}`]: { displayName: snapData.displayName, uid: snapData.uid },
              });
          } else {
            throw new Error(
              "The timesheet has either not been submitted and approved " +
                "or it was already locked"
            );
          }
        });
      });
      transactions.push(trans);
    });
    return Promise.all(transactions).then(() => {
      return exportJson({ id: timeTrackingDocRef.id });
    });
  } else {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `There are no outstanding approved timesheets for the week ending ${format(
        utcToZonedTime(weekEnding, "America/Thunder_Bay"),
        "yyyy MMM dd"
      )}`
    );
  }
};

// Given a TimeTracking id, create or update a file on Google storage
// with the locked timeSheets and amendments. Must be called by another
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
      .collection("TimeTracking")
      .doc(data.id)
      .get();
    const timeSheetsSnapshot = await db
      .collection("TimeSheets")
      .where("approved", "==", true)
      .where("locked", "==", true)
      .where("weekEnding", "==", trackingSnapshot.get("weekEnding"))
      .get();

    // delete internal properties for each timeSheet
    const timeSheets = timeSheetsSnapshot.docs.map((doc) => {
      const docData = doc.data();
      delete docData.submitted;
      delete docData.approved;
      delete docData.locked;
      delete docData.rejected;
      delete docData.rejectionReason;
      docData.weekEnding = docData.weekEnding.toDate();
      docData.entries.map((entry: TimeEntry) => {
        const cleaned: any = entry;
        delete cleaned.weekEnding;
        cleaned.date = entry.date.toDate();
        return cleaned;
      });
      return docData;
    });

    // Get any outstanding amendments to include in the export.
    const amendmentsSnapshot = await db
    .collection("TimeAmendments")
    .where("committedWeekEnding", "==", trackingSnapshot.get("weekEnding"))
    .get();
  
    // prep internal properties for export
    const amendments = amendmentsSnapshot.docs.map((doc) => {
      const docData = doc.data();
      docData.created = docData.created.toDate();
      docData.commitTime = docData.commitTime.toDate();
      docData.committedWeekEnding = docData.committedWeekEnding.toDate();
      docData.weekEnding = docData.weekEnding.toDate();
      docData.date = docData.date.toDate();
      docData.amendment = true;
      return docData;
    });
  
    // generate JSON output
    const output = JSON.stringify(timeSheets.concat(amendments));

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
        const destination = "TimeTrackingExports/" + filename;
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

// call exportJson as soon as a TimeAmendment is committed
export async function exportOnAmendmentCommit(
  change: functions.ChangeJson,
  context: functions.EventContext,
) {
    const committedWeekEnding = change.after.data().committedWeekEnding;
    if (committedWeekEnding !== undefined) {
      const timeTrackingDocRef = await getTimeTrackingDoc(committedWeekEnding);
      return exportJson({ id: timeTrackingDocRef.id });
    }
  };

// Confirm the context has specified claim and throw userful errors as necessary
function contextHasClaim(context: functions.https.CallableContext, claim: string) {
  if (!context.auth) {
    // Throw an HttpsError so that the client gets the error details
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Caller must be authenticated"
    );
  }

  // caller must have the claim
  if (
    !(
      Object.prototype.hasOwnProperty.call(context.auth.token, claim) &&
      context.auth.token[claim] === true
    )
  ) {
    // Throw an HttpsError so that the client gets the error details
    throw new functions.https.HttpsError(
      "permission-denied",
      `Caller must have the ${claim} claim`
    );
  } else {
    return true;
  }
}

export async function commitTimeAmendment(data: unknown, context: functions.https.CallableContext) {
  if (!contextHasClaim(context, "tame")) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Call to commitTimeAmendment() failed"
    );
  }

  // Validate the data or throw
  // use a User Defined Type Guard
  if (!isDocIdObject(data)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The provided data doesn't contain a document id"
    );
  }
  const db = admin.firestore();
  const commitUid = context.auth?.uid;
  if (commitUid === undefined) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Unable to read User ID from callable context"
    )
  }
  const commitName = await (await db.collection("Profiles").doc(commitUid).get()).get("displayName");
  
  const amendmentUid = await (await db.collection("TimeAmendments").doc(data.id).get()).get("uid");
  const profile = (await db.collection("Profiles").doc(amendmentUid).get()).data();

  if (profile === undefined) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Unable to read profile corresponding to this Time Amendment"
    );
  }
  // This does not need to be a transaction because amendments are neither
  // submitted nor approved.
  return db.collection("TimeAmendments").doc(data.id).update({
      committed: true,
      commitTime: admin.firestore.FieldValue.serverTimestamp(),
      commitUid,
      commitName,
      salary: profile.salary,
      tbtePayrollId: profile.tbtePayrollId,
    });
};
