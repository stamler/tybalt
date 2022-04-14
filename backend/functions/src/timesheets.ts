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
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as _ from "lodash";
import { getAuthObject, TimeEntry, isDocIdObject, createPersistentDownloadUrl, TimeOffTypes, getTrackingDoc } from "./utilities";
import { createSSHMySQLConnection2 } from "./sshMysql";
import { updateProfileTallies } from "./profiles";

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

  // throw if the caller isn't authenticated & authorized
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

    const timeTrackingDocRef = await getTrackingDoc(weekEnding,"TimeTracking","weekEnding");

    if (
      afterData &&
      afterData.submitted === true &&
      afterData.approved !== beforeApproved &&
      afterData.approved === true &&
      afterData.locked === false
    ) {
      // just approved
      // add summary of newly approved TimeSheet to pending, remove from submitted
      return timeTrackingDocRef.update(
        {
          [`pending.${change.after.ref.id}`]: buildPendingObj(afterData),
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
      // update the Time Off Tallies on the corresponding profile
      try {
        await updateProfileTallies(afterData.uid);
      } catch (error) {
        functions.logger.error(`Error on updateProfileTallies for user ${afterData.uid}: ${error}`)
      }
      // remove the *manually* unlocked Time Sheet from timeSheets 
      // and add it to pending
      functions.logger.info(`updateTimeTracking() TimeSheet ${change.after.ref.id} has been manually unlocked.`);
      await timeTrackingDocRef.update(
        {
          [`pending.${change.after.ref.id}`]: buildPendingObj(afterData),
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
      // just recalled or rejected after being approved
      // remove the document from submitted
      return timeTrackingDocRef.update(
        {
          [`submitted.${change.after.ref.id}`]: admin.firestore.FieldValue.delete(),
          [`pending.${change.after.ref.id}`]: admin.firestore.FieldValue.delete(),
        }
      );
    } else if (
      afterData &&
      afterData.submitted === true &&
      afterData.approved === true &&
      afterData.locked !== beforeLocked &&
      afterData.locked === true
    ) {
      // just locked
      // update the Time Off and mileage Tallies on the corresponding profile
      try {
        await updateProfileTallies(afterData.uid);
      } catch (error) {
        functions.logger.error(`Error on updateProfileTallies for user ${afterData.uid}: ${error}`)
      }
      // remove document from pending and add it to timeSheets
      await timeTrackingDocRef.update(
        {
          [`pending.${change.after.ref.id}`]: admin.firestore.FieldValue.delete(),
          [`timeSheets.${change.after.ref.id}`]: buildPendingObj(afterData),
        }
      );
    } else if (!_.isEqual(afterData?.viewerIds, beforeData?.viewerIds)) {
      // viewerIds changed from UI, so that must have been the only change
      // per the firestore rules. Do nothing to time tracking.
      return ;
    } else if (!_.isEqual(afterData?.viewers, beforeData?.viewers)) {
      // viewers updated from function, do nothing to time tracking.
      return ;
    } else if (!_.isEqual(afterData?.reviewedIds, beforeData?.reviewedIds)) {
      // The timesheet was reviewed from UI, so that must have been the only change
      // per the firestore rules. Do nothing to time tracking.
      return ;
    } else {
      // rejected or deleted or manually unapproved (without rejection)
      // remove the TimeSheet from pending

      // This case is also reached if a property is added or removed
      // to or from a TimeSheet manually or any other change that isn't
      // caught in the else clauses above. 
      // TODO: We should check to see which fields changed and if 
      // it wasn't locked, approved, or submitted we should do nothing here
      functions.logger.info(`updateTimeTracking() TimeSheet ${change.after.ref.id} default condition, removing entries.`);
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
  If the viewerIds array has changed, update the viewers object
*/
export const updateViewers = functions.firestore
  .document("TimeSheets/{timesheetId}")
  .onUpdate(async (change, context) => {
    const afterData = change.after?.data();
    const beforeData = change.before?.data();
    if (_.isEqual(afterData.viewerIds, beforeData.viewerIds)) {return ;}
    const db = admin.firestore();
    const managers = db.collection("ManagerNames");
    const viewers: { [uid: string]: { displayName: string } } = {};
    for (const uid of afterData.viewerIds) {
      const displayName = (await managers.doc(uid).get()).get("displayName");
      viewers[uid] = { displayName };
    }
    return db
      .collection("TimeSheets")
      .doc(context.params.timesheetId)
      .update({ viewers });
  });


/*
  TimeSheets MUST NEVER BE unlocked, manually or otherwise, if they have
  a property exportInProgress set to true. This is a highly privileged 
  function that gets called by only permitted users and uses a transaction 
  that verifies no exportInProgress flag exists prior to unlocking. It then
  sets the exportInProgress flag and deletes any corresponding rows in 
  MySQL. Finally it unsets the exportInProgress flag.
*/
export async function unlockTimesheet(data: unknown, context: functions.https.CallableContext) {
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

  // run transaction to read the timesheet and if it exists check that
  // it is locked and an export is not in progress. Then unlock it.
  const timeSheet = db.collection("TimeSheets").doc(data.id);
  await db.runTransaction(async (transaction) => {
    return transaction.get(timeSheet).then(async (tsSnap) => {
      const snapData = tsSnap.data();
      if (!snapData) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "The TimeSheets document is empty so cannot be unlocked"
        );
      }
      if (snapData.locked !== true) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "The TimeSheets document can't be unlocked because it is not locked"
        );
      }
      if (snapData.exportInProgress === true) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "The TimeSheets document can't be unlocked because it is" + 
          " currently being exported"
        );
      }
      // if exported is already true, set deleteFromMySQL=true to perform the
      // deletion next. Update the success and fail batches to run after the
      // deletion depending on the outcome.
      if (snapData.exported === true) {
        deleteFromMySQL = true;
        functions.logger.info(`${tsSnap.id} will be unlocked after it is ` + 
          "deleted from the export destination.");
        successBatch.update(timeSheet, { 
          exportInProgress: admin.firestore.FieldValue.delete(),
          locked: false,
          exported: false,
        });
        failBatch.update(timeSheet, { 
          exportInProgress: admin.firestore.FieldValue.delete(),
        });
        return transaction.update(timeSheet, { exportInProgress: true });
      }
      
      // timesheet is lockable, lock it and set the exported flag to false
      return transaction.update(timeSheet, { locked: false });
    });
  });

  if (deleteFromMySQL) {
    // Delete from MySQL then if successful run successBatch.commit()
    const mysqlConnection = await createSSHMySQLConnection2();
    try {
      await mysqlConnection.query("DELETE FROM TimeSheets WHERE id=?", [timeSheet.id]);
    } catch (error) {
      await failBatch.commit();
      throw new functions.https.HttpsError(
        "internal",
        "An error occured while deleting the Timesheet from the synced database");
    }
    return successBatch.commit();
  }
  return;
}

/*
  Given a document id, lock the corresponding approved TimeSheet document
  and mark it as exported:false.
*/
export async function lockTimesheet(data: unknown, context: functions.https.CallableContext) {

  getAuthObject(context, ["tslock"])

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
  const timeSheet = db.collection("TimeSheets").doc(data.id);
  await db.runTransaction(async (transaction) => {
    return transaction.get(timeSheet).then(async (tsSnap) => {
      const snapData = tsSnap.data();
      if (!snapData) {
        throw new functions.https.HttpsError(
          "internal",
          "The TimeSheet docsnap was empty during the locking transaction"
        );
      }
      if (
        snapData.submitted === true &&
        snapData.approved === true &&
        snapData.locked === false
      ) {
        // if exported is already true, the exported flag needs to be cleared
        // prior to locking, with the cleanTime() function in sync.ts
        // otherwise set locked:true, and leave exported:true
        if (snapData.exported === true) {
          throw new functions.https.HttpsError(
            "failed-precondition",
            "The timesheet was previouly exported and the database is in an " +
            "inconsistent state. Please contact a tybalt admin.");
        }
        
        // timesheet is lockable, lock it and set the exported flag to false
        return transaction.update(timeSheet, { locked: true, exported: false });
      } else {
        throw new functions.https.HttpsError("failed-precondition",
          "The timesheet has either not been submitted and approved " +
            "or it was already locked"
        );
      }
    });
  });
}

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
      delete docData.rejectorId;
      delete docData.rejectorName;
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
      const timeTrackingDocRef = await getTrackingDoc(committedWeekEnding.toDate(),"TimeTracking","weekEnding");
      return exportJson({ id: timeTrackingDocRef.id });
    }
  };

export async function commitTimeAmendment(data: unknown, context: functions.https.CallableContext) {

  // throw if the caller isn't authenticated & authorized
  getAuthObject(context, ["tame"]);

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
      exported: false,
    });
};

// create object summary of TimeSheet
function buildPendingObj(data: admin.firestore.DocumentData ) {
  const pendingObj: PendingTimeSheetSummary = { 
    displayName: data.displayName, 
    uid: data.uid,
    offRotationDaysTally: data.offRotationDaysTally,
    hoursWorked: data.workHoursTally.jobHours + data.workHoursTally.hours,
    bankedHours: data.bankedHours,
    payoutRequest: data.payoutRequest,
  }
  // add nonWorkHoursTally props
  for (const key in data.nonWorkHoursTally) {
    pendingObj[key as TimeOffTypes] = data.nonWorkHoursTally[key];
  }
  return pendingObj;
}