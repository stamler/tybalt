import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { format } from "date-fns";
import { utcToZonedTime } from "date-fns-tz";
import { TimeEntry } from "./utilities";
import { createSSHMySQLConnection2 } from "./sshMysql";
import { loadSQLFileToString } from "./sqlQueries";
import { RowDataPacket } from "mysql2";
//const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
//admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

export const syncToSQL = functions
  .runWith({ memory: "1GB", timeoutSeconds:180 })
  .pubsub
  .schedule("0 12,17 * * 1-5") // M-F noon & 5pm, 10 times per week
//  .schedule("0 * * * *") // every hour
  .timeZone("America/Thunder_Bay")
  .onRun(async (context) => {
    await cleanupTime();
    await exportTime();
    await cleanupExport("TimeAmendments");
    await exportAmendments();
    await cleanupExport("Expenses");
    await exportExpenses();
    await exportProfiles();
    try {
      await writebackProfiles();
    } catch (error) {
      await db.collection("Emails").add({
        toUids: ["UAmV8K6DcXVhSrMAtZua0OmCUPu2"],
        message: {
          subject: `Profile writeback failed during syncToSQL()`,
          text: 
            `Hi,\n\n` +
            `The scheduled syncToSQL() taks failed to writeback profile changes. ` +
            `The error is\n ${
              JSON.stringify(error)
            }\n. Please solve this issue\n\n` +
            "- Tybalt",
        },
      });
    }
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

  // Get the first "batchSize" documents that are locked but not yet exported.
  // Since runs are idempotent we can just run it again if there are remaining
  // documents (i.e. initial sync). batchSize must be large enough to, on
  // average, export all the docs generated within the scheduled export cadence
  const batchSize = 499;
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
  const batchSize = 499;
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
cleanupExport() cleans up the exportInProgress:true property on the specified
collection. See cleanupTime() for more details.
*/
export async function cleanupExport(collection: string) {
  const mysqlConnection = await createSSHMySQLConnection2();

  // Get the documents where exportInProgress:true. They may locked/committed or
  // unlocked/uncommitted, exported or not exported
  const docSnaps = await db.collection(collection)
    .where("exportInProgress", "==", true)
    .get();

  // Check to make sure another operation isn't already running
  const exportLocksDoc = db.collection("Locks").doc("exportInProgress");
  await db.runTransaction(async t => {
    const lockDoc = await t.get(exportLocksDoc);
    if (lockDoc.exists) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "cleanupExport(): export or cleanup are already running"
      );
    }
    return t.set(exportLocksDoc,{ message: `cleanupExport(${collection}) transaction created `+
    "this doc to prevent other export or cleanup functions " + 
    "from running simultaneously."})
  });

  await mysqlConnection.query("START TRANSACTION");

  // create the batch that will be run only if the export MySQL COMMIT succeeds
  const cleanupSuccessBatch = db.batch();

  // Iterate over the Collection documents, DELETINGing them from the 
  // Collection tables.
  const docResults = docSnaps.docs.map(async docSnap => {
    // This will throw, thus returning a rejected promise, if it fails
    await mysqlConnection.query(`DELETE FROM ${collection} WHERE id=?`, [docSnap.id])

    // DELETEs were successful for this doc, mark it in success batch
    return cleanupSuccessBatch.update(docSnap.ref, {
      exported: false,
      exportInProgress: admin.firestore.FieldValue.delete(),
    });
  });

  try {
    await Promise.all(docResults);
    await mysqlConnection.query("COMMIT;");
    // delete exportInProgress property and set exported:false on local docs
    functions.logger.log(`Cleaned up ${docResults.length} previous ${collection} exports`);
    await cleanupSuccessBatch.commit();
  } catch (error) {
    functions.logger.error(`Cleanup failed ${error}`);
    await mysqlConnection.query("ROLLBACK;");
  }
  return exportLocksDoc.delete();
}

/*
exportExpenses(): Export committed unexported docs to MySQL. If the destination
is verified correct, set exported:true on the local document, otherwise rollback
the changes on the external source and make no changes to the local document.
Since the local documents could potentially be uncommitted during write to the
destination, flag the local documents as exportInProgress:true at the beginning
using a transaction. uncommitExpense() must respect this flag by NEVER UNLOCKING
A DOCUMENT THAT HAS THIS FLAG SET. The final batch update will delete this flag.
This is a manual document-locking mechanism that can span a longer time than a
transaction during the exportExpenses() function call 
*/
export async function exportExpenses() {
  const start = process.hrtime.bigint();
  const mysqlConnection = await createSSHMySQLConnection2();

  // Get the first "batchSize" documents that are committed but not yet exported
  // This batches runs. Since runs are idempotent we can just run it again if
  // there are remaining documents (i.e. initial sync). batchSize must be large
  // enough to, on average, export all the docs generated within the scheduled
  // export cadence
  const batchSize = 499;
  const pendingExportQuery = db.collection("Expenses")
    .where("committed", "==", true)
    .where("exported", "==", false)
    .limit(batchSize);

  const exportLocksDoc = db.collection("Locks").doc("exportInProgress");

  // Run the query and set the flag exportInProgress:true. At the same time
  // create a batch to delete the exportInProgress:true flag that will be run
  // only if the export fails.
  const [expenseDocSnaps, exportFailBatch] = await db.runTransaction(async t => {
    const rollbackBatch = db.batch();
    const lockDoc = await t.get(exportLocksDoc);
    if (lockDoc.exists) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "exportExpenses(): exportTime() or cleanupTime() or exportAmendments() or exportExpenses() are already running"
      );
    }
    const expenseSnaps = await t.get(pendingExportQuery);
    const docs:admin.firestore.QueryDocumentSnapshot[] = [];
    expenseSnaps.forEach(expenseSnap => {
      // skip the Expenses doc if prerequisites aren't met
      if (
        expenseSnap.get("exportInProgress") === true || // another export is running
        expenseSnap.get("committed") !== true || // the Expense hasn't been committed
        expenseSnap.get("exported") === true // the Expense is already exported
      ) {
        // skip this Expenses document
        return;
      }
      docs.push(expenseSnap);
      rollbackBatch.update(expenseSnap.ref, {
        exportInProgress: admin.firestore.FieldValue.delete(),
      });
      t.update(expenseSnap.ref, { exportInProgress: true });
    });
    t.set(exportLocksDoc,{ message: "exportExpense() transaction created this " +
      "doc to prevent other instances of exportTime() or cleanupTime() or " + 
      "exportAmendment() from running simultaneously."})
    return [docs, rollbackBatch];
  });

  // create the batch that will be run only if the export MySQL COMMIT succeeds
  const exportSuccessBatch = db.batch();

  // Iterate over the Expenses documents, INSERTing them into MySQL table
  const expensesFields = ["id", "attachment", "breakfast", "client", "ccLast4digits", "commitName", "commitTime", "commitUid", "committedWeekEnding", "date", "description", "dinner", "displayName", "distance", "division", "divisionName", "givenName", "job", "jobDescription", "lodging", "lunch", "managerName", "managerUid", "payPeriodEnding", "paymentType", "po", "surname", "tbtePayrollId", "total", "uid", "unitNumber", "vendorName"];
  const insertValues = expenseDocSnaps.map((expenseSnap) => {
    const expense = expenseSnap.data();
    expense.id = expenseSnap.id;
    expense.commitTime = expense.commitTime.toDate();
    expense.committedWeekEnding = format(utcToZonedTime(expense.committedWeekEnding.toDate(),"America/Thunder_Bay"), "yyyy-MM-dd");
    expense.payPeriodEnding = format(utcToZonedTime(expense.payPeriodEnding.toDate(),"America/Thunder_Bay"), "yyyy-MM-dd");
    expense.date = format(utcToZonedTime(expense.date.toDate(),"America/Thunder_Bay"), "yyyy-MM-dd");
    // VALUEs were included in the data set for this doc, include it in success batch
    exportSuccessBatch.update(expenseSnap.ref, {
      exported: true,
      exportInProgress: admin.firestore.FieldValue.delete(),
    });    
    return expensesFields.map(x => expense[x]);
  });

  const q = `INSERT INTO Expenses (${expensesFields.toString()}) VALUES ?`;
  try {
    if (insertValues.length > 0) {
      await mysqlConnection.query(q, [insertValues]);
    }
    // delete exportInProgress:true property, set exported:true on local docs
    await exportSuccessBatch.commit();
    const end = process.hrtime.bigint();
    const elapsed = (end - start) / BigInt(1000000000);
    functions.logger.log(`Exported ${insertValues.length} Expenses documents in ${elapsed.toString()} sec`);
  } catch (error) {
    // delete exportInProgress:true property on local docs
    await exportFailBatch.commit();
    functions.logger.error(`Export failed ${error}`);
  }

  return exportLocksDoc.delete();
}

/*
clearFlags(): Set exported:false or delete exportInProgress where currently true
for all docs in collection This is a utility function and shouldn't generally be
run in production unless trying to rebuild the target database from scratch
*/
export async function clearFlags(collection: string, flag: "exported" | "exportInProgress") {
  let updateObject: any = {};
  if (flag === "exported") {
    updateObject = { exported: false };
  } else if (flag === "exportInProgress") {
    updateObject = { exportInProgress: admin.firestore.FieldValue.delete() };
  }
  const query = db.collection(collection)
    .where(flag, "==", true)
    .limit(500); // maximum allowed batch size in Firestore
  const docSnaps = await query.get();
  const batch = db.batch();
  docSnaps.forEach(docSnap => {
    batch.update(docSnap.ref, updateObject);
  });
  return batch.commit();
}

/*
exportProfiles(): Export Profiles documents to MySQL, but only fields including
id, surname, givenName, openingDateTimeOff, openingOP, openingOV. These will be
used to calculated the usedOV and usedOP values by ensuring only the OP and OV
values on or after the openingDateTimeOff are included in the calculation. A
timestamp column which is updated on UPSERT is used to determine which Profiles
are stale (at least 2 minutes old) and should be deleted. These are cleaned up
in this function.
*/
export async function exportProfiles() {
  // const start = process.hrtime.bigint();
  const mysqlConnection = await createSSHMySQLConnection2();

  // Get specified fields from all profiles and store them in an array of arrays
  // to be used in the INSERT query
  const allProfilesQuerySnap = await db.collection("Profiles").get();
  const profilesFields = ["id", "surname", "givenName", "openingDateTimeOff", "openingOP", "openingOV", "untrackedTimeOff", "timestamp"];
  const now = new Date();
  const insertValues = allProfilesQuerySnap.docs.map((profileSnap) => {
    const profile = profileSnap.data();
    profile.id = profileSnap.id;
    // now is a javascript date that will be the same for all retrieved
    // profiles. We do this instead of NOW() because there is no way to pass a
    // function to this parameter. We would let the database set the timestamp
    // except that on the UPSERT if the data already exists and isn't changed
    // then the timestamp won't be updated.
    profile.timestamp = now;
    // if openingDateTimeOff is null, log a warning and skip this profile
    const stamp = profile.openingDateTimeOff;
    if (stamp === null || stamp === undefined) {
      functions.logger.warn(`${profile.displayName}'s profile ${profile.id} has null or undefined openingDateTimeOff and will not be exported.`);
      return;
    }
    profile.openingDateTimeOff = format(utcToZonedTime(stamp.toDate(),"America/Thunder_Bay"), "yyyy-MM-dd")
    return profilesFields.map(x => profile[x]);
  });
  // UPSERT the Profiles data into the MySQL table NOTE: Profiles that have been
  // deleted from Firestore will remain in MySQL. For this reason we delete all
  // rows where the timestamp is older than expected. We can safely assume that
  // 5 minutes prior to now is too old.
  const q = `INSERT INTO Profiles (${profilesFields.toString()}) VALUES ? ON DUPLICATE KEY UPDATE surname=VALUES(surname), givenName=VALUES(givenName), openingDateTimeOff=VALUES(openingDateTimeOff), openingOP=VALUES(openingOP), openingOV=VALUES(openingOV), untrackedTimeOff=VALUES(untrackedTimeOff), timestamp=UTC_TIMESTAMP()`;
  try {
    await mysqlConnection.query(q, [insertValues]);
  } catch (error) {
    functions.logger.error(`Failed to export Profiles documents: ${error}`);
    throw error
  }
  functions.logger.log(`UPSERTed ${insertValues.length} Profiles documents`);
  const cleanupQuery = "DELETE FROM Profiles p WHERE p.timestamp < UTC_TIMESTAMP() - INTERVAL 2 MINUTE";
  let cleanupResult;
  try {
    cleanupResult = await mysqlConnection.query(cleanupQuery);
  } catch (error) {
    functions.logger.error(`Failed to cleanup stale Profiles rows: ${error}`);
    throw error
  }
  functions.logger.log(`Cleaned up stale Profiles rows`);

  // The affectedRows property is the number of rows that were deleted, but I'm
  // lazy and this is typescript so I'm just going to show the whole object
  // instead of declaring a type and then using it to extract the property
  functions.logger.log(cleanupResult[0]);
}

/*
writebackProfiles(): Write back the usedOV and usedOP, mileageClaimed and
mileageClaimedSince values to the Profiles collection. This is done by
retrieving the Profiles data from MySQL and then updating the Firestore
documents.
*/

export async function writebackProfiles() {
  // Load and run the query
  const mileageSql = loadSQLFileToString("mileageClaimed");
  const timeOffSql = loadSQLFileToString("timeOffTallies");
  const connection = await createSSHMySQLConnection2();
  const [mr, _fields0] = await connection.query(mileageSql);
  const [tr, _fields1] = await connection.query(timeOffSql);

  const profilesQuery = await db.collection("Profiles").get();
  const profiles = profilesQuery.docs;
  functions.logger.debug(`${profilesQuery.size} in profiles query`);
  const updateProfilesBatch = db.batch()

  let mileageClaimedSince: Date;
  
  // Update the mileageClaimed and mileageClaimedSince properties and the usedOV
  // and usedOP properties on each profile where a value exists in SQL, or set
  // it to 0
  if (Array.isArray(mr) && Array.isArray(tr)) {
    // Cast the correct types to remove ambiguity. There may be a better way to
    // do this
    const mileageRows = mr as RowDataPacket[];
    const timeOffRows = tr as RowDataPacket[];
  
    functions.logger.debug(`${mileageRows.length} mileage values and ${timeOffRows.length} time off values returned from SQL queries`);
    // The mileageClaimedSince property is set to the reset date in SQL. Since
    // this is the same for every row, we can get it here then use it throughout
    // the rest of the function. However, if there are no rows in the mileage
    // query, then we can't get the value and we'll have to manually get it from
    // the MileageResetDates table in MySQL.
    if (mileageRows.length > 0) {
      mileageClaimedSince = new Date(mileageRows[0].jsDate);
    } else {
      const mileageResetSql = "SELECT MAX(date) FROM MileageResetDates WHERE date < NOW()";
      const [rr, _fields2] = await connection.query(mileageResetSql);
      const resetRows = rr as RowDataPacket[];
      if (resetRows.length === 1) {
        functions.logger.debug(`mileageClaimedSince set to ${resetRows[0]["MAX(date)"]} from SQL query`);
        mileageClaimedSince = new Date(resetRows[0]["MAX(date)"]);
        // NOTE: at this point mileageClaimedSince isn't set to 11:59:59.999 PM
        // on the date in EST but it will likely suffice as a temporary date
        // since as soon as actual data is being synced the date will be
        // updated.
      } else {
        throw new Error(`Expected 1 row from MileageResetDates query, got ${resetRows.length}`);
      }
    }

    // For each profile, check whether it has a matching row in each of the SQL
    // queries. If not, set the corresponding values to 0.
    profiles.forEach((profile) => {
      const mileageRow = mileageRows.find((x: any) => x.uid === profile.id);
      const timeOffRow = timeOffRows.find((x: any) => x.uid === profile.id);
      const mileageClaimed = mileageRow ? mileageRow.mileageClaimed : 0;
      const usedOV = timeOffRow ? timeOffRow.usedOV : 0;
      const usedOP = timeOffRow ? timeOffRow.usedOP : 0;
      const usedAsOf = timeOffRow ? new Date(timeOffRow.jsDateWeekEnding) : null;

      // functions.logger.debug(`Updating ${profile.id} with mileageClaimed=${mileageClaimed}, usedOV=${usedOV}, usedOP=${usedOP}, mileageClaimedSince=${mileageClaimedSince}, usedAsOf=${usedAsOf}`);
      const profileRef = db.collection("Profiles").doc(profile.id);
      updateProfilesBatch.update(profileRef, {
        mileageClaimed,
        mileageClaimedSince,
        usedOV,
        usedOP,
        usedAsOf,
      });
    });
  }
  
  // Commit the batch
  return updateProfilesBatch.commit();
}