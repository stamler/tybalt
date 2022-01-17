import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { format } from "date-fns";
import { utcToZonedTime } from "date-fns-tz";
import { TimeEntry } from "./utilities";
import { createSSHMySQLConnection, query } from "./sshMysql";
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
    return;
  });

/*
exportTime():
For locked unexported docs where the requiresReExport:true flag isn't set, 
flatten the TimeEntries then export. If the destination is verified correct, set 
exported:true on the local document, otherwise rollback the changes on the
external source and make no changes to the local document. Since the local
documents could potentially be unlocked during write to the destination, flag
the local documents as exportInProgress:true at the beginning using a
transaction. unlockTimesheet() must respect this flag by NEVER UNLOCKING A
DOCUMENT THAT HAS THIS FLAG SET. The final batch update will delete this flag. 
This is a manual document-locking mechanism that can span a longer time than a 
transaction during the exportTime() function call */
export async function exportTime() {
  const start = process.hrtime.bigint();
  const mysqlConnection = await createSSHMySQLConnection();

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

  // Run the query and set the flag exportInProgress:true. At the same time
  // create a batch to delete the exportInProgress:true flag that will be run
  // only if the export fails. Skip docs with have requiresReExport:true flag
  const [tsdocsnaps, exportFailBatch] = await db.runTransaction(async t => {
    const rollbackBatch = db.batch();
    const tsSnaps = await t.get(pendingExportQuery);
    const docs:admin.firestore.QueryDocumentSnapshot[] = [];
    tsSnaps.forEach(tsSnap => {
      // skip the TimeSheets doc if prerequisites aren't met
      if (
        tsSnap.get("exportInProgress") === true || // another export is running
        tsSnap.get("locked") !== true || // the TimeSheet isn't locked
        tsSnap.get("exported") === true || // the TimeSheet is already exported
        tsSnap.get("requiresReExport") === true // existing export is dirty
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
    return [docs, rollbackBatch];
  });

  //  MySQL doesn't support deferred constraints per the SQL standard like
  //  PostgreSQL does. This means we cannot insert both the parent and child rows
  //  in the same transaction because the child will fail due to missing parent.

  //  The workaround is disabling FOREIGN_KEY_CHECKS on this transaction
  //  because we are using the same value within this function for the fields
  //  and failure of any query should fail the entire transaction.
    
  //  multipleStatements is disabled by default in mysql2 hence 2 queries

  await query(mysqlConnection, "SET FOREIGN_KEY_CHECKS=0;");
  await query(mysqlConnection, "START TRANSACTION;");

  // create the batch that will be run only if the export MySQL COMMIT succeeds
  const exportSuccessBatch = db.batch();

  // Iterate over the TimeSheets documents, INSERTing them and their 
  // corresponding TimeEntries into the respective MySQL tables
  const tsresults = tsdocsnaps.map(async tsSnap => {
    const snapData = tsSnap.data();
    const timeSheet = {
      id: tsSnap.id,
      uid: snapData.uid,
      givenName: snapData.givenName,
      surname: snapData.surname,
      managerUid: snapData.managerUid,
      managerName: snapData.managerName,
      tbtePayrollId: snapData.tbtePayrollId,
      salary: snapData.salary,
      weekEnding: format(utcToZonedTime(snapData.weekEnding.toDate(),"America/Thunder_Bay"), "yyyy-MM-dd"),
    };

    // Insert the TimeSheet-level data into the TimeSheets table first
    const tsSQLResponse = query(mysqlConnection, "INSERT INTO TimeSheets SET ?", [timeSheet]);
    
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
    const entriesSQLResponse = query(mysqlConnection, q, [insertValues]);

    try {
      await Promise.all([tsSQLResponse, entriesSQLResponse]);
    } catch (error) {
      console.log(`Failed to export TimeSheets document ${timeSheet.id} ${timeSheet.tbtePayrollId}`);
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
    await query(mysqlConnection, "COMMIT;");
    // delete exportInProgress:true property, set exported:true on local docs
    await exportSuccessBatch.commit();
    const end = process.hrtime.bigint();
    const elapsed = (end - start) / BigInt(1000000000);
    console.log(`Exported ${tsresults.length} TimeSheets documents in ${elapsed.toString()} sec`);
  } catch (error) {
    await query(mysqlConnection, "ROLLBACK;");
    // delete exportInProgress:true property on local docs
    await exportFailBatch.commit();
    console.log(`Export failed ${error}`);
  }

  return query(mysqlConnection, "SET FOREIGN_KEY_CHECKS=1;");
};

/*
cleanupTime();
For each document where requiresReExport:true, find corresponding entries in
MySQL under TimeSheets and TimeEntries and delete them. Then once successful
deletion is confirmed, delete the requiresReExport property and set 
exported:false. The next time exportTime() runs, this document will be
exported fresh. */
export async function cleanupTime() {
  const mysqlConnection = await createSSHMySQLConnection();

  // Get the documents where requiresReExport:true. They may locked or
  // unlocked but exported WILL BE true
  const tsSnaps = await db.collection("TimeSheets")
    .where("requiresReExport", "==", true)
    .get();
  
  await query(mysqlConnection, "START TRANSACTION;");

  // create the batch that will be run only if the export MySQL COMMIT succeeds
  const cleanupSuccessBatch = db.batch();

  // Iterate over the TimeSheets documents, DELETINGing them from the 
  // TimeSheets tables. The ON CASCADE of TimeEntries will automatically
  // delete the entries so we don't have to handle that here.
  const tsresults = tsSnaps.docs.map(async tsSnap => {
    // This will throw, thus returning a rejected promise, if it fails
    await query(mysqlConnection, "DELETE FROM TimeSheets WHERE id=?", [tsSnap.id]);

    // DELETEs were successful for this doc, mark it in success batch
    return cleanupSuccessBatch.update(tsSnap.ref, {
      exported: false,
      requiresReExport: admin.firestore.FieldValue.delete(),
    });
  });

  try {
    await Promise.all(tsresults);
    await query(mysqlConnection, "COMMIT;");
    // delete requiresReExport property and set exported:false on local docs
    console.log(`Cleaned up ${tsresults.length} previous TimeSheets exports`);    
    return cleanupSuccessBatch.commit();
  } catch (error) {
    console.log(`Cleanup failed ${error}`);
    return query(mysqlConnection, "ROLLBACK;");
  }

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