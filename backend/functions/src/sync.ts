import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { format } from "date-fns";
import { utcToZonedTime } from "date-fns-tz";
import { TimeEntry } from "./utilities";
import { createSSHMySQLConnection2 } from "./sshMysql";
//const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
//admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

export const syncTime = functions
  .runWith({ memory: "1GB", timeoutSeconds:180 })
  .pubsub
  .schedule("0 12,17 * * 1-5") // M-F noon & 5pm, 10 times per week
  .timeZone("America/Thunder_Bay")
  .onRun(async (context) => {
    await cleanupTime();
    await exportTime();
    await cleanupAmendments();
    await exportAmendments();
    return;
  });

/*
exportTime():
For locked unexported docs, flatten the TimeEntries then export. If the
destination is verified correct, set exported:true on the local document,
otherwise rollback the changes on the external source and make no changes to the
local document. Since the local documents could potentially be unlocked during
write to the destination, flag the local documents as exportInProgress:true at
the beginning using a transaction. unlockTimesheet() must respect this flag by
NEVER UNLOCKING A DOCUMENT THAT HAS THIS FLAG SET. The final batch update will
delete this flag. This is a manual document-locking mechanism that can span a
longer time than a transaction during the exportTime() function call 
*/
export async function exportTime() {
  const start = process.hrtime.bigint();
  const mysqlConnection = await createSSHMySQLConnection2();

  // Get the first "batchSize" documents that are locked but not yet exported
  // This batches runs. Since runs are idempotent we can just run it again if
  // there are remaining documents (i.e. initial sync). batchSize must be large
  // enough to, on average, export all the docs generated within the scheduled
  // export cadence
  const batchSize = 500;
  const pendingExportQuery = db.collection("TimeSheets")
    .where("locked", "==", true)
    .where("exported", "==", false)
    .limit(batchSize);

  const exportLocksDoc = db.collection("Locks").doc("exportInProgress");

  // Run the query and set the flag exportInProgress:true. At the same time
  // create a batch to delete the exportInProgress:true flag that will be run
  // only if the export fails.
  const [tsdocsnaps, exportFailBatch] = await db.runTransaction(async t => {
    const rollbackBatch = db.batch();
    const lockDoc = await t.get(exportLocksDoc);
    if (lockDoc.exists) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "exportTime(): exportTime() or cleanupTime() are already running"
      );
    }
    const tsSnaps = await t.get(pendingExportQuery);
    const docs:admin.firestore.QueryDocumentSnapshot[] = [];
    tsSnaps.forEach(tsSnap => {
      // skip the TimeSheets doc if prerequisites aren't met
      if (
        tsSnap.get("exportInProgress") === true || // another export is running
        tsSnap.get("locked") !== true || // the TimeSheet isn't locked
        tsSnap.get("exported") === true // the TimeSheet is already exported
      ) {
        // skip this TimeSheets document
        return;
      }
      docs.push(tsSnap);
      rollbackBatch.update(tsSnap.ref, {
        exportInProgress: admin.firestore.FieldValue.delete(),
      });
      t.update(tsSnap.ref, { exportInProgress: true });
    });
    t.set(exportLocksDoc,{ message: "exportTime() transaction created this " +
      "doc to prevent other instances of exportTime() or cleanupTime() from " +
      "running simultaneously."})
    return [docs, rollbackBatch];
  });
  //  MySQL doesn't support deferred constraints per the SQL standard like
  //  PostgreSQL does. This means we cannot insert both the parent and child rows
  //  in the same transaction because the child will fail due to missing parent.
  //  The workaround is disabling FOREIGN_KEY_CHECKS on this transaction
  //  because we are using the same value within this function for the fields
  //  and failure of any query should fail the entire transaction.
  //  multipleStatements is disabled by default in mysql2 hence 2 queries

  await mysqlConnection.query("SET FOREIGN_KEY_CHECKS=0;");
  await mysqlConnection.query("START TRANSACTION;");

  // create the batch that will be run only if the export MySQL COMMIT succeeds
  const exportSuccessBatch = db.batch();

  // Iterate over the TimeSheets documents, INSERTing them and their 
  // corresponding TimeEntries into the respective MySQL tables
  const tsresults = tsdocsnaps.map(async tsSnap => {
    const snapData = tsSnap.data();
    const workWeekHours = snapData.workWeekHours === undefined ? 40 : snapData.workWeekHours;
    const timeSheet = {
      id: tsSnap.id,
      uid: snapData.uid,
      givenName: snapData.givenName,
      surname: snapData.surname,
      managerUid: snapData.managerUid,
      managerName: snapData.managerName,
      tbtePayrollId: snapData.tbtePayrollId,
      workWeekHours,
      salary: snapData.salary,
      weekEnding: format(utcToZonedTime(snapData.weekEnding.toDate(),"America/Thunder_Bay"), "yyyy-MM-dd"),
    };

    // Insert the TimeSheet-level data into the TimeSheets table first
    const tsSQLResponse = mysqlConnection.query("INSERT INTO TimeSheets SET ?", [timeSheet]);
    
    // Get the entries then INSERT them into MySQL in the transaction
    const timeEntriesFields = ["uid", "tsid", "date", "timetype", "timetypeName", "division", "divisionName", "client", "job", "workrecord", "jobDescription", "hours", "jobHours", "mealsHours", "workDescription", "payoutRequestAmount"];
    const entries: TimeEntry[] = tsSnap.get("entries");
    const insertValues = entries.map((entry: TimeEntry) => {
      const cleaned: any = entry;
      delete cleaned.weekEnding;
      cleaned.tsid = tsSnap.id;
      cleaned.date = format(utcToZonedTime(entry.date.toDate(),"America/Thunder_Bay"), "yyyy-MM-dd")
      return timeEntriesFields.map(x => cleaned[x]);
    });
    const q = `INSERT INTO TimeEntries (${timeEntriesFields.toString()}) VALUES ?`;
    const entriesSQLResponse = mysqlConnection.query(q, [insertValues]);

    try {
      await Promise.all([tsSQLResponse, entriesSQLResponse]);
    } catch (error) {
      functions.logger.error(`Failed to export TimeSheets document ${timeSheet.id} ${timeSheet.tbtePayrollId}`);
      throw error
    }

    // INSERTs were successful for this doc, mark it in success batch
    return exportSuccessBatch.update(tsSnap.ref, {
      exported: true,
      exportInProgress: admin.firestore.FieldValue.delete(),
    });
  });

  try {
    await Promise.all(tsresults);
    await mysqlConnection.query( "COMMIT;");
    // delete exportInProgress:true property, set exported:true on local docs
    await exportSuccessBatch.commit();
    const end = process.hrtime.bigint();
    const elapsed = (end - start) / BigInt(1000000000);
    functions.logger.log(`Exported ${tsresults.length} TimeSheets documents in ${elapsed.toString()} sec`);
  } catch (error) {
    await mysqlConnection.query( "ROLLBACK;");
    // delete exportInProgress:true property on local docs
    await exportFailBatch.commit();
    functions.logger.error(`Export failed ${error}`);
  }

  await mysqlConnection.query( "SET FOREIGN_KEY_CHECKS=1;");
  return exportLocksDoc.delete();
};

/*
cleanupTime();
For each document where exportInProgress:true, find corresponding entries in
MySQL under TimeSheets and TimeEntries and delete them. Then once successful
deletion is confirmed, delete the exportInProgress property and set 
exported:false. The next time exportTime() runs, this document will be
exported fresh. */
export async function cleanupTime() {
  const mysqlConnection = await createSSHMySQLConnection2();

  // Get the documents where exportInProgress:true. They may locked or
  // unlocked, exported or not exported
  const tsSnaps = await db.collection("TimeSheets")
    .where("exportInProgress", "==", true)
    .get();

  // Check to make sure another operation isn't already running
  const exportLocksDoc = db.collection("Locks").doc("exportInProgress");
  await db.runTransaction(async t => {
    const lockDoc = await t.get(exportLocksDoc);
    if (lockDoc.exists) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "cleanupTime(): exportTime() or cleanupTime() are already running"
      );
    }
    return t.set(exportLocksDoc,{ message: "cleanupTime() transaction created "+
    "this doc to prevent other instances of exportTime() or cleanupTime() " + 
    "from running simultaneously."})
  });

  await mysqlConnection.query( "START TRANSACTION;");

  // create the batch that will be run only if the export MySQL COMMIT succeeds
  const cleanupSuccessBatch = db.batch();

  // Iterate over the TimeSheets documents, DELETINGing them from the 
  // TimeSheets tables. The ON CASCADE of TimeEntries will automatically
  // delete the entries so we don't have to handle that here.
  const tsresults = tsSnaps.docs.map(async tsSnap => {
    // This will throw, thus returning a rejected promise, if it fails
    await mysqlConnection.query( "DELETE FROM TimeSheets WHERE id=?", [tsSnap.id]);

    // DELETEs were successful for this doc, mark it in success batch
    return cleanupSuccessBatch.update(tsSnap.ref, {
      exported: false,
      exportInProgress: admin.firestore.FieldValue.delete(),
    });
  });

  try {
    await Promise.all(tsresults);
    await mysqlConnection.query("COMMIT;");
    // delete exportInProgress property and set exported:false on local docs
    functions.logger.log(`Cleaned up ${tsresults.length} previous TimeSheets exports`);    
    await cleanupSuccessBatch.commit();
  } catch (error) {
    functions.logger.error(`Cleanup failed ${error}`);
    await mysqlConnection.query("ROLLBACK;");
  }
  return exportLocksDoc.delete();
}

/*
exportTime() but for TimeAmendments
*/
export async function exportAmendments() {
  const start = process.hrtime.bigint();
  const mysqlConnection = await createSSHMySQLConnection2();

  // Get the first "batchSize" documents that are locked but not yet exported
  // This batches runs. Since runs are idempotent we can just run it again if
  // there are remaining documents (i.e. initial sync). batchSize must be large
  // enough to, on average, export all the docs generated within the scheduled
  // export cadence
  const batchSize = 500;
  const pendingExportQuery = db.collection("TimeAmendments")
    .where("committed", "==", true)
    .where("exported", "==", false)
    .limit(batchSize);

  const exportLocksDoc = db.collection("Locks").doc("exportInProgress");

  // Run the query and set the flag exportInProgress:true. At the same time
  // create a batch to delete the exportInProgress:true flag that will be run
  // only if the export fails.
  const [amenddocsnaps, exportFailBatch] = await db.runTransaction(async t => {
    const rollbackBatch = db.batch();
    const lockDoc = await t.get(exportLocksDoc);
    if (lockDoc.exists) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "exportAmendments(): exportTime() or cleanupTime() or exportAmendments() are already running"
      );
    }
    const amendmentSnaps = await t.get(pendingExportQuery);
    const docs:admin.firestore.QueryDocumentSnapshot[] = [];
    amendmentSnaps.forEach(amendmentSnap => {
      // skip the TimeAmendments doc if prerequisites aren't met
      if (
        amendmentSnap.get("exportInProgress") === true || // another export is running
        amendmentSnap.get("committed") !== true || // the Amendment hasn't been committed
        amendmentSnap.get("exported") === true // the Amendment is already exported
      ) {
        // skip this TimeAmendments document
        return;
      }
      docs.push(amendmentSnap);
      rollbackBatch.update(amendmentSnap.ref, {
        exportInProgress: admin.firestore.FieldValue.delete(),
      });
      t.update(amendmentSnap.ref, { exportInProgress: true });
    });
    t.set(exportLocksDoc,{ message: "exportAmendment() transaction created this " +
      "doc to prevent other instances of exportTime() or cleanupTime() or " + 
      "exportAmendment() from running simultaneously."})
    return [docs, rollbackBatch];
  });

  // create the batch that will be run only if the export MySQL COMMIT succeeds
  const exportSuccessBatch = db.batch();

  // Iterate over the TimeAmendments documents, INSERTing them into MySQL table
  const timeAmendmentsFields = ["id", "creator", "creatorName", "commitUid", "commitName", "commitTime", "created", "committedWeekEnding", "uid", "givenName", "surname", "tbtePayrollId", "workWeekHours", "salary", "weekEnding", "date", "timetype", "timetypeName", "division", "divisionName", "client", "job", "workrecord", "jobDescription", "hours", "jobHours", "mealsHours", "workDescription", "payoutRequestAmount"];
  const insertValues = amenddocsnaps.map((amendSnap) => {
    const amendment = amendSnap.data();
    // if the amendment has no workWeekHours property, default to 40
    amendment.workWeekHours = amendment.workWeekHours === undefined ? 40 : amendment.workWeekHours;
    amendment.id = amendSnap.id;
    amendment.commitTime = amendment.commitTime.toDate();
    amendment.created = amendment.created.toDate();
    amendment.committedWeekEnding = format(utcToZonedTime(amendment.committedWeekEnding.toDate(),"America/Thunder_Bay"), "yyyy-MM-dd");
    amendment.weekEnding = format(utcToZonedTime(amendment.weekEnding.toDate(),"America/Thunder_Bay"), "yyyy-MM-dd");
    amendment.date = format(utcToZonedTime(amendment.date.toDate(),"America/Thunder_Bay"), "yyyy-MM-dd");
    // VALUEs were included in the data set for this doc, include it in success batch
    exportSuccessBatch.update(amendSnap.ref, {
      exported: true,
      exportInProgress: admin.firestore.FieldValue.delete(),
    });    
    return timeAmendmentsFields.map(x => amendment[x]);
  });
  
  const q = `INSERT INTO TimeAmendments (${timeAmendmentsFields.toString()}) VALUES ?`;
  try {
    if (insertValues.length > 0) {
      await mysqlConnection.query(q, [insertValues]);
    }
    // delete exportInProgress:true property, set exported:true on local docs
    await exportSuccessBatch.commit();
    const end = process.hrtime.bigint();
    const elapsed = (end - start) / BigInt(1000000000);
    functions.logger.log(`Exported ${insertValues.length} TimeAmendments documents in ${elapsed.toString()} sec`);
  } catch (error) {
    // delete exportInProgress:true property on local docs
    await exportFailBatch.commit();
    functions.logger.error(`Export failed ${error}`);
  }

  return exportLocksDoc.delete();
};

/*
cleanupTime() but for TimeAmendments
*/
export async function cleanupAmendments() {
  const mysqlConnection = await createSSHMySQLConnection2();

  // Get the documents where exportInProgress:true. They may locked or
  // unlocked, exported or not exported
  const amendmentSnaps = await db.collection("TimeAmendments")
    .where("exportInProgress", "==", true)
    .get();

  // Check to make sure another operation isn't already running
  const exportLocksDoc = db.collection("Locks").doc("exportInProgress");
  await db.runTransaction(async t => {
    const lockDoc = await t.get(exportLocksDoc);
    if (lockDoc.exists) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "cleanupAmendments(): export[Time | Amendments]() or cleanup[Time | Amendments]() are already running"
      );
    }
    return t.set(exportLocksDoc,{ message: "cleanupAmendments() transaction created "+
    "this doc to prevent other export or cleanup functions " + 
    "from running simultaneously."})
  });

  await mysqlConnection.query("START TRANSACTION");

  // create the batch that will be run only if the export MySQL COMMIT succeeds
  const cleanupSuccessBatch = db.batch();

  // Iterate over the TimeAmendments documents, DELETINGing them from the 
  // TimeAmendments tables.
  const amendmentresults = amendmentSnaps.docs.map(async amendmentSnap => {
    // This will throw, thus returning a rejected promise, if it fails
    await mysqlConnection.query("DELETE FROM TimeAmendments WHERE id=?", [amendmentSnap.id])

    // DELETEs were successful for this doc, mark it in success batch
    return cleanupSuccessBatch.update(amendmentSnap.ref, {
      exported: false,
      exportInProgress: admin.firestore.FieldValue.delete(),
    });
  });

  try {
    await Promise.all(amendmentresults);
    await mysqlConnection.query("COMMIT;");
    // delete exportInProgress property and set exported:false on local docs
    functions.logger.log(`Cleaned up ${amendmentresults.length} previous TimeAmendments exports`);
    await cleanupSuccessBatch.commit();
  } catch (error) {
    functions.logger.error(`Cleanup failed ${error}`);
    await mysqlConnection.query("ROLLBACK;");
  }
  return exportLocksDoc.delete();
}

/*
clearExportedFlags():
Set exported:false where currently true for all TimeSheets docs
This is a utility function and shouldn't generally be run in production unless
trying to rebuild the target database from scratch
*/
export async function clearExportedFlags() {
  const exportedQuery = db.collection("TimeSheets")
    .where("exported", "==", true)
    .limit(500); // maximum allowed batch size in Firestore
  const tsSnaps = await exportedQuery.get();
  const batch = db.batch();
  tsSnaps.forEach(tsSnap => {
    batch.update(tsSnap.ref, { exported: false });
  });
  return batch.commit();
}

/*
clearExportInProgressFlags():
Set exported:false where currently true for all TimeSheets docs
This is a utility function and shouldn't generally be run in production unless
cleaning up after a failed exportTime()
*/
export async function clearExportInProgressFlags() {
  const exportLockQuery = db.collection("TimeSheets")
    .where("exportInProgress", "==", true)
    .limit(500); // maximum allowed batch size in Firestore
  const tsSnaps = await exportLockQuery.get();
  const batch = db.batch();
  tsSnaps.forEach(tsSnap => {
    batch.update(
      tsSnap.ref,
      { exportInProgress: admin.firestore.FieldValue.delete() }
    );
  });
  return batch.commit();
}