import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { format } from "date-fns";
import { utcToZonedTime } from "date-fns-tz";
import { TimeEntry, InvoiceLineObject } from "./utilities";
import { APP_NATIVE_TZ } from "./config";
import { createSSHMySQLConnection2 } from "./sshMysql";
import { loadSQLFileToString } from "./sqlQueries";
import { RowDataPacket, Connection } from "mysql2/promise";
import { FUNCTIONS_CONFIG_SECRET } from "./secrets";
import { FieldPair, objDiff, analyzeFoldAction } from "./fold-utils";
//const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
//admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

export const syncToSQL = functions
  .runWith({ memory: "1GB", timeoutSeconds:180, secrets: [FUNCTIONS_CONFIG_SECRET] })
  .pubsub
  .schedule("0 12,17 * * 1-5") // M-F noon & 5pm, 10 times per week
//  .schedule("0 * * * *") // every hour
  .timeZone(APP_NATIVE_TZ)
  .onRun(async (context) => {
    // create a single connection to MySQL and use it for all operations
    const mysqlConnection = await createSSHMySQLConnection2();
    await cleanupTime(mysqlConnection);
    await exportTime(mysqlConnection);
    await cleanupExport(mysqlConnection, "TimeAmendments");
    await exportAmendments(mysqlConnection);
    // Fold TurboExpensesWriteback into Expenses before exporting to MySQL
    // TODO: Ensure we preserve legacy workflow/export fields (e.g., committed/exported)
    // so the fold does not wipe state needed by exportExpenses(). Alternatively, 
    // confirm that having the fields missing doesn't break the exportExpenses() function.
    await foldCollection(
      "TurboExpensesWriteback",
      "Expenses",
      [{ sourceField: "immutableID", destField: "immutableID" }],
      ["submittedDate"]
    );
    await cleanupExport(mysqlConnection, "Expenses");
    await exportExpenses(mysqlConnection);
    // Export Turbo expenses writeback data (vendors before purchase orders due to FK constraint)
    await exportTurboVendors(mysqlConnection);
    await exportTurboPurchaseOrders(mysqlConnection);
    await cleanupExport(mysqlConnection, "Invoices");
    await deleteReplacedInvoices(mysqlConnection);
    await exportInvoices(mysqlConnection);
    await exportProfiles(mysqlConnection);
    try {
      await writebackProfiles(mysqlConnection);
    } catch (error) {
      functions.logger.error(`Failed to writeback profiles: ${error}`);
      await db.collection("Emails").add({
        toUids: ["UAmV8K6DcXVhSrMAtZua0OmCUPu2"],
        message: {
          subject: "Profile writeback failed during syncToSQL()",
          text: 
            "Hi,\n\n" +
            "The scheduled syncToSQL() taks failed to writeback profile changes. " +
            `The error is\n ${
              JSON.stringify(error)
            }\n. Please solve this issue\n\n` +
            "- Tybalt",
        },
      });
    }
    // Fold TurboJobsWriteback into Jobs before exporting to MySQL
    await foldCollection(
      "TurboJobsWriteback",
      "Jobs",
      [
        { sourceField: "_id", destField: "_id" },
        { sourceField: "immutableID", destField: "immutableID" },
      ],
      ["hasTimeEntries", "lastTimeEntryDate"]
    );
    await exportJobs(mysqlConnection);
    // Export Turbo writeback data (clients before contacts due to FK constraint)
    const turboClientsExported = await exportTurboClients(mysqlConnection);
    await exportTurboClientContacts(mysqlConnection);
    if (turboClientsExported > 0) {
      await cleanupTurboClients(mysqlConnection);
    }
    return mysqlConnection.end();
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
export async function exportTime(mysqlConnection: Connection) {
  const start = process.hrtime.bigint();

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
      payrollId: snapData.payrollId,
      workWeekHours,
      salary: snapData.salary,
      weekEnding: format(utcToZonedTime(snapData.weekEnding.toDate(),APP_NATIVE_TZ), "yyyy-MM-dd"),
    };

    // Insert the TimeSheet-level data into the TimeSheets table first
    const tsSQLResponse = mysqlConnection.query("INSERT INTO TimeSheets SET ?", [timeSheet]);
    
    // Get the entries then INSERT them into MySQL in the transaction
    const timeEntriesFields = ["uid", "tsid", "date", "timetype", "timetypeName", "division", "divisionName", "client", "job", "workrecord", "jobDescription", "hours", "jobHours", "mealsHours", "workDescription", "payoutRequestAmount", "category"];
    const entries: TimeEntry[] = tsSnap.get("entries");
    const insertValues = entries.map((entry: TimeEntry) => {
      const cleaned: any = entry;
      delete cleaned.weekEnding;
      cleaned.tsid = tsSnap.id;
      cleaned.date = format(utcToZonedTime(entry.date.toDate(),APP_NATIVE_TZ), "yyyy-MM-dd")
      return timeEntriesFields.map(x => cleaned[x]);
    });
    const q = `INSERT INTO TimeEntries (${timeEntriesFields.toString()}) VALUES ?`;
    const entriesSQLResponse = mysqlConnection.query(q, [insertValues]);

    try {
      await Promise.all([tsSQLResponse, entriesSQLResponse]);
    } catch (error) {
      functions.logger.error(`Failed to export TimeSheets document ${timeSheet.id} ${timeSheet.payrollId}`);
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
export async function cleanupTime(mysqlConnection: Connection) {

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
export async function exportAmendments(mysqlConnection: Connection) {
  const start = process.hrtime.bigint();

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
  const timeAmendmentsFields = ["id", "creator", "creatorName", "commitUid", "commitName", "commitTime", "created", "committedWeekEnding", "uid", "givenName", "surname", "payrollId", "workWeekHours", "salary", "weekEnding", "date", "timetype", "timetypeName", "division", "divisionName", "client", "job", "workrecord", "jobDescription", "hours", "jobHours", "mealsHours", "workDescription", "payoutRequestAmount"];
  const insertValues = amenddocsnaps.map((amendSnap) => {
    const amendment = amendSnap.data();
    // if the amendment has no workWeekHours property, default to 40
    amendment.workWeekHours = amendment.workWeekHours === undefined ? 40 : amendment.workWeekHours;
    amendment.id = amendSnap.id;
    amendment.commitTime = amendment.commitTime.toDate();
    amendment.created = amendment.created.toDate();
    amendment.committedWeekEnding = format(utcToZonedTime(amendment.committedWeekEnding.toDate(),APP_NATIVE_TZ), "yyyy-MM-dd");
    amendment.weekEnding = format(utcToZonedTime(amendment.weekEnding.toDate(),APP_NATIVE_TZ), "yyyy-MM-dd");
    amendment.date = format(utcToZonedTime(amendment.date.toDate(),APP_NATIVE_TZ), "yyyy-MM-dd");
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
export async function cleanupExport(mysqlConnection:Connection, collection: string) {
  functions.logger.debug(`cleanupExport(${collection})`);

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
export async function exportExpenses(mysqlConnection: Connection) {
  const start = process.hrtime.bigint();

  // Set to true to process ALL pending expenses in one call (iterating in batches)
  // Set to false to process only one batch per call (default behavior)
  const PROCESS_ALL_BATCHES = false;

  // Get the first "batchSize" documents that are committed but not yet exported
  // This batches runs. Since runs are idempotent we can just run it again if
  // there are remaining documents (i.e. initial sync). batchSize must be large
  // enough to, on average, export all the docs generated within the scheduled
  // export cadence
  const batchSize = 499;
  const exportLocksDoc = db.collection("Locks").doc("exportInProgress");
  const expensesFields = ["id", "category", "attachment", "breakfast", "client", "ccLast4digits", "commitName", "commitTime", "commitUid", "committedWeekEnding", "date", "description", "dinner", "displayName", "distance", "division", "divisionName", "givenName", "job", "jobDescription", "lodging", "lunch", "managerName", "managerUid", "payPeriodEnding", "paymentType", "po", "surname", "payrollId", "total", "uid", "unitNumber", "vendorName", "immutableID"];

  // Build an ON DUPLICATE KEY UPDATE clause so re-exporting (exported=false)
  // doesn't fail with a duplicate primary key error. We update all columns
  // except the primary key `id`.
  const updateClause = expensesFields
    .filter(x => x !== "id")
    .map(x => `${x}=VALUES(${x})`)
    .join(", ");
  const q = `INSERT INTO Expenses (${expensesFields.toString()}) VALUES ? ON DUPLICATE KEY UPDATE ${updateClause}`;

  let totalExported = 0;
  let batchNumber = 0;
  let hasMoreDocuments = true;
  let consecutiveSkippedBatches = 0;
  const maxConsecutiveSkippedBatches = 3; // Fail if we skip this many batches in a row without progress

  // Acquire the lock atomically using a transaction - holds for entire multi-batch operation
  await db.runTransaction(async t => {
    const lockDoc = await t.get(exportLocksDoc);
    if (lockDoc.exists) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "exportExpenses(): exportTime() or cleanupTime() or exportAmendments() or exportExpenses() are already running"
      );
    }
    t.set(exportLocksDoc, { message: "exportExpense() created this " +
      "doc to prevent other instances of exportTime() or cleanupTime() or " + 
      "exportAmendment() from running simultaneously."});
  });

  try {
    do {
      batchNumber++;
      const pendingExportQuery = db.collection("Expenses")
        .where("committed", "==", true)
        .where("exported", "==", false)
        .limit(batchSize);

      // Run the query and set the flag exportInProgress:true on each doc. At the same
      // time create a batch to delete the exportInProgress:true flag that will be run
      // only if the export fails.
      const [expenseDocSnaps, exportFailBatch, querySize] = await db.runTransaction(async t => {
        const rollbackBatch = db.batch();
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
        return [docs, rollbackBatch, expenseSnaps.size];
      });

      // If the query returned no documents, we're done
      if (querySize === 0) {
        hasMoreDocuments = false;
        break;
      }

      // If all docs were skipped (e.g., all have exportInProgress), skip to next batch
      if (expenseDocSnaps.length === 0) {
        consecutiveSkippedBatches++;
        functions.logger.warn(`Batch ${batchNumber}: All ${querySize} docs skipped (consecutive skips: ${consecutiveSkippedBatches})`);
        if (consecutiveSkippedBatches >= maxConsecutiveSkippedBatches) {
          throw new functions.https.HttpsError(
            "failed-precondition",
            `exportExpenses(): ${consecutiveSkippedBatches} consecutive batches skipped without progress. ` +
            "This likely indicates stuck exportInProgress flags that need manual cleanup via clearFlags()."
          );
        }
        hasMoreDocuments = querySize === batchSize;
        continue;
      }

      // Reset skip counter since we made progress
      consecutiveSkippedBatches = 0;

      // create the batch that will be run only if the export MySQL COMMIT succeeds
      const exportSuccessBatch = db.batch();

      // Iterate over the Expenses documents, INSERTing them into MySQL table
      const insertValues = expenseDocSnaps.map((expenseSnap) => {
        const expense = expenseSnap.data();
        expense.id = expenseSnap.id;
        expense.commitTime = expense.commitTime.toDate();
        expense.committedWeekEnding = format(utcToZonedTime(expense.committedWeekEnding.toDate(),APP_NATIVE_TZ), "yyyy-MM-dd");
        expense.payPeriodEnding = format(utcToZonedTime(expense.payPeriodEnding.toDate(),APP_NATIVE_TZ), "yyyy-MM-dd");
        expense.date = format(utcToZonedTime(expense.date.toDate(),APP_NATIVE_TZ), "yyyy-MM-dd");
        // VALUEs were included in the data set for this doc, include it in success batch
        exportSuccessBatch.update(expenseSnap.ref, {
          exported: true,
          exportInProgress: admin.firestore.FieldValue.delete(),
        });    
        return expensesFields.map(x => expense[x]);
      });

      try {
        if (insertValues.length > 0) {
          await mysqlConnection.query(q, [insertValues]);
        }
        // delete exportInProgress:true property, set exported:true on local docs
        await exportSuccessBatch.commit();
        totalExported += insertValues.length;
        functions.logger.log(`Batch ${batchNumber}: Exported ${insertValues.length} Expenses documents (total: ${totalExported})`);
      } catch (error) {
        // delete exportInProgress:true property on local docs
        await exportFailBatch.commit();
        functions.logger.error(`Export failed ${error}`);
        throw error;
      }

      // Check if we should continue (only if PROCESS_ALL_BATCHES is true and there might be more)
      // Use querySize (not filtered expenseDocSnaps.length) since docs can be skipped
      hasMoreDocuments = querySize === batchSize;

    } while (PROCESS_ALL_BATCHES && hasMoreDocuments);

  } finally {
    // Always release the lock when done (success or failure)
    await exportLocksDoc.delete();
  }

  const end = process.hrtime.bigint();
  const elapsed = (end - start) / BigInt(1000000000);
  functions.logger.log(`Exported ${totalExported} Expenses documents total in ${elapsed.toString()} sec`);
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
exportJobs(): Export Jobs documents to MySQL
*/
export async function exportJobs(mysqlConnection: Connection) {
  functions.logger.debug("exporting jobs");
  const allJobsQuerySnap = await db.collection("Jobs").get();
  const jobsFields = ["id", "number", "alternateManagerDisplayName", "alternateManagerUid", "categories", "client", "branch", "clientContact", "description", "divisions", "fnAgreement", "hasTimeEntries", "immutableID", "jobOwner", "lastTimeEntryDate", "location", "outstandingBalance", "outstandingBalanceDate", "authorizingDocument", "clientPo", "clientReferenceNumber", "created", "updated", "jobTimeAllocations", "manager", "managerDisplayName", "managerUid", "projectAwardDate", "proposal", "proposalOpeningDate", "proposalSubmissionDueDate", "status", "timestamp", "clientId", "clientContactId", "jobOwnerId", "parentId", "proposalId"];
  const now = new Date();

  const insertValues = allJobsQuerySnap.docs.map((jobSnap) => {
    const job = jobSnap.data();
    job.id = jobSnap.id;
    job.number = jobSnap.id; // Job number is the document ID
    job.timestamp = now;
    
    // Existing array handling
    if (job.categories !== null && job.categories !== undefined) {
      job.categories = job.categories.join(",");
    }
    if (job.divisions !== null && job.divisions !== undefined) {
      job.divisions = job.divisions.join(",");
    }
    
    // Existing date handling (Firestore Timestamps)
    if (job.lastTimeEntryDate !== null && job.lastTimeEntryDate !== undefined) {
      job.lastTimeEntryDate = format(utcToZonedTime(job.lastTimeEntryDate.toDate(),APP_NATIVE_TZ), "yyyy-MM-dd")
    }
    if (job.projectAwardDate !== null && job.projectAwardDate !== undefined) {
      job.projectAwardDate = format(utcToZonedTime(job.projectAwardDate.toDate(),APP_NATIVE_TZ), "yyyy-MM-dd")
    }
    if (job.proposalOpeningDate !== null && job.proposalOpeningDate !== undefined) {
      job.proposalOpeningDate = format(utcToZonedTime(job.proposalOpeningDate.toDate(),APP_NATIVE_TZ), "yyyy-MM-dd")
    }
    if (job.proposalSubmissionDueDate !== null && job.proposalSubmissionDueDate !== undefined) {
      job.proposalSubmissionDueDate = format(utcToZonedTime(job.proposalSubmissionDueDate.toDate(),APP_NATIVE_TZ), "yyyy-MM-dd")
    }
    
    // Handle outstandingBalanceDate (string in Firestore from writeback, DATE in MySQL)
    if (job.outstandingBalanceDate !== null && job.outstandingBalanceDate !== undefined && job.outstandingBalanceDate !== "") {
      job.outstandingBalanceDate = job.outstandingBalanceDate || null;
    } else {
      job.outstandingBalanceDate = null;
    }
    
    // Handle created/updated timestamps (strings from writeback)
    if (job.created !== null && job.created !== undefined && job.created !== "") {
      job.created = new Date(job.created);
    } else {
      job.created = null;
    }
    if (job.updated !== null && job.updated !== undefined && job.updated !== "") {
      job.updated = new Date(job.updated);
    } else {
      job.updated = null;
    }
    
    // Handle jobTimeAllocations (object -> JSON string)
    if (job.jobTimeAllocations !== null && job.jobTimeAllocations !== undefined) {
      job.jobTimeAllocations = JSON.stringify(job.jobTimeAllocations);
    } else {
      job.jobTimeAllocations = null;
    }
    
    // Ensure branch is present (may be undefined on some documents)
    job.branch = job.branch === undefined || job.branch === null ? null : job.branch;
    
    // Include ID fields (will be populated after TurboJobsWriteback fold operation)
    job.clientId = job.clientId || null;
    job.clientContactId = job.clientContactId || null;
    job.jobOwnerId = job.jobOwnerId || null;
    job.parentId = job.parentId || null;
    job.proposalId = job.proposalId || null;
    
    // Handle new string fields
    job.location = job.location || null;
    job.outstandingBalance = job.outstandingBalance ?? 0;
    job.authorizingDocument = job.authorizingDocument || null;
    job.clientPo = job.clientPo || null;
    job.clientReferenceNumber = job.clientReferenceNumber || null;
    
    return jobsFields.map(x => job[x]);
  })

  // CLEANUP FROM HERE
  // UPSERT the Jobs data into the MySQL table NOTE: Jobs that have been
  // deleted from Firestore will remain in MySQL. For this reason we delete all
  // rows where the timestamp is older than expected. We can safely assume that
  // 2 minutes prior to now is too old.
  const q = `REPLACE INTO Jobs (${jobsFields.toString()}) VALUES ? `;
  try {
    await mysqlConnection.query(q, [insertValues]);
  } catch (error) {
    functions.logger.error(`Failed to export Jobs documents: ${error}`);
    throw error
  }
  functions.logger.log(`UPSERTed ${insertValues.length} Jobs documents`);
  const cleanupQuery = "DELETE FROM Jobs j WHERE j.timestamp < UTC_TIMESTAMP() - INTERVAL 2 MINUTE";
  let cleanupResult;
  try {
    cleanupResult = await mysqlConnection.query(cleanupQuery);
  } catch (error) {
    functions.logger.error(`Failed to cleanup stale Jobs rows: ${error}`);
    throw error
  }
  functions.logger.debug("Cleaned up stale Jobs rows");

  // The affectedRows property is the number of rows that were deleted, but I'm
  // lazy and this is typescript so I'm just going to show the whole object
  // instead of declaring a type and then using it to extract the property
  functions.logger.debug(cleanupResult[0]);

}

/*
foldCollection(): Generic function to merge documents from a source collection into a destination collection.

This "fold" operation moves documents from source to destination based on field pair matching rules.
For each source document, it checks if destination documents exist that match on the specified field pairs.

Logic:
- REPLACE: If ALL field pairs match exactly one destination doc AND it's the SAME doc, overwrite it
- CREATE: If NO field pairs match any destination docs, create new
- ERROR: Any other case (conflicts, multiple matches) - log and skip, leaving doc in source

@param sourceCollection - Name of the source Firestore collection
@param destCollection - Name of the destination Firestore collection  
@param fieldPairs - Array of field pairs defining match rules. Use "_id" to reference document ID.
*/
// Maps destination collection names to the corresponding field in Config/Enable document.
// If that field is true, editing is enabled in legacy Tybalt and fold should be skipped.
const collectionToEnableField: Record<string, string> = {
  Jobs: "jobs",
  Expenses: "expenses",
};

export async function foldCollection(
  sourceCollection: string,
  destCollection: string,
  fieldPairs: FieldPair[],
  preserveFields: string[] = []
): Promise<void> {
  functions.logger.info(`Starting fold of ${sourceCollection} into ${destCollection}`);

  // Check if editing is enabled for this collection in legacy Tybalt
  const enableField = collectionToEnableField[destCollection];
  if (enableField) {
    const enableDoc = await db.collection("Config").doc("Enable").get();
    const enableData = enableDoc.data() || {};
    if (enableData[enableField] === true) {
      functions.logger.info(
        `Fold skipped: ${destCollection} editing is enabled in legacy Tybalt (Config/Enable.${enableField} = true)`
      );
      return;
    }
  }
  
  const sourceSnap = await db.collection(sourceCollection).get();
  
  if (sourceSnap.empty) {
    functions.logger.info(`No ${sourceCollection} documents to fold`);
    return;
  }
  
  let replacedCount = 0, createdCount = 0, skippedCount = 0, errorCount = 0;

  for (const sourceDoc of sourceSnap.docs) {
    const sourceData = sourceDoc.data();
    const result = await analyzeFoldAction(
      db,
      destCollection,
      fieldPairs,
      sourceDoc.id,
      sourceData,
      preserveFields
    );

    switch (result.action) {
    case "create":
      await db.collection(destCollection).doc(result.destDocId).set(result.data);
      await sourceDoc.ref.delete();
      createdCount++;
      functions.logger.debug(`Created ${destCollection} doc ${result.destDocId}`);
      break;

    case "replace": {
      const diff = objDiff(result.existingData, result.newData);
      if (Object.keys(diff).length === 0) {
        // No actual changes - just delete source without overwriting destination
        await sourceDoc.ref.delete();
        skippedCount++;
        functions.logger.debug(`Skipped ${destCollection} doc ${result.destDocId} (no changes)`);
      } else {
        await db.collection(destCollection).doc(result.destDocId).set(result.newData);
        await sourceDoc.ref.delete();
        replacedCount++;
        functions.logger.debug(`Replaced ${destCollection} doc ${result.destDocId}`, {
          diff: JSON.stringify(diff),
        });
      }
      break;
    }

    case "error":
      functions.logger.error(
        `${result.reason} for source doc ${sourceDoc.id}`
      );
      errorCount++;
      break;
    }
  }

  functions.logger.info(
    `Fold complete: ${replacedCount} replaced, ${createdCount} created, ${skippedCount} skipped (no changes), ${errorCount} errors`
  );
}


/*
exportTurboClients(): Export TurboClientsWriteback documents to MySQL TurboClients table.
These are clients that have been written back from Turbo (PocketBase) via the jobs writeback endpoint.
Returns the number of exported rows so cleanup can run after contacts cleanup.
*/
export async function exportTurboClients(mysqlConnection: Connection): Promise<number> {
  functions.logger.debug("exporting TurboClients");
  const allClientsQuerySnap = await db.collection("TurboClientsWriteback").get();
  
  if (allClientsQuerySnap.empty) {
    functions.logger.log("No TurboClientsWriteback documents to export");
    return 0;
  }

  const clientsFields = ["id", "name", "businessDevelopmentLeadUid", "timestamp"];
  const now = new Date();

  const insertValues = allClientsQuerySnap.docs.map((clientSnap) => {
    const client = clientSnap.data();
    return [
      clientSnap.id, // id (PocketBase ID used as doc key)
      client.name || null,
      client.businessDevelopmentLead || null, // field is businessDevelopmentLead in Firestore, businessDevelopmentLeadUid in MySQL
      now,
    ];
  });

  // UPSERT the TurboClients data into the MySQL table
  const updateClause = clientsFields
    .filter(x => x !== "id")
    .map(x => `${x}=VALUES(${x})`)
    .join(", ");
  const q = `INSERT INTO TurboClients (${clientsFields.toString()}) VALUES ? ON DUPLICATE KEY UPDATE ${updateClause}`;
  
  try {
    await mysqlConnection.query(q, [insertValues]);
  } catch (error) {
    functions.logger.error(`Failed to export TurboClients documents: ${error}`);
    throw error;
  }
  functions.logger.log(`UPSERTed ${insertValues.length} TurboClients documents`);

  return insertValues.length;
}

/*
cleanupTurboClients(): Remove stale TurboClients rows after TurboClientContacts cleanup.
*/
async function cleanupTurboClients(mysqlConnection: Connection) {
  // Cleanup stale rows (older than 2 minutes)
  const cleanupQuery = "DELETE FROM TurboClients WHERE timestamp < UTC_TIMESTAMP() - INTERVAL 2 MINUTE";
  try {
    const cleanupResult = await mysqlConnection.query(cleanupQuery);
    functions.logger.debug("Cleaned up stale TurboClients rows");
    functions.logger.debug(cleanupResult[0]);
  } catch (error) {
    functions.logger.error(`Failed to cleanup stale TurboClients rows: ${error}`);
    throw error;
  }
}

/*
exportTurboClientContacts(): Export TurboClientContactsWriteback documents to MySQL TurboClientContacts table.
These are client contacts that have been written back from Turbo (PocketBase) via the jobs writeback endpoint.
Uses UPSERT pattern with timestamp-based cleanup for stale rows.
Must be called AFTER exportTurboClients due to foreign key constraint.
*/
export async function exportTurboClientContacts(mysqlConnection: Connection): Promise<number> {
  functions.logger.debug("exporting TurboClientContacts");
  const allContactsQuerySnap = await db.collection("TurboClientContactsWriteback").get();
  
  if (allContactsQuerySnap.empty) {
    functions.logger.log("No TurboClientContactsWriteback documents to export");
    return 0;
  }

  const contactsFields = ["id", "surname", "givenName", "email", "clientId", "timestamp"];
  const now = new Date();

  const insertValues = allContactsQuerySnap.docs.map((contactSnap) => {
    const contact = contactSnap.data();
    return [
      contactSnap.id, // id (PocketBase ID used as doc key)
      contact.surname || null,
      contact.givenName || null,
      contact.email || null,
      contact.clientId || null,
      now,
    ];
  });

  // UPSERT the TurboClientContacts data into the MySQL table
  const updateClause = contactsFields
    .filter(x => x !== "id")
    .map(x => `${x}=VALUES(${x})`)
    .join(", ");
  const q = `INSERT INTO TurboClientContacts (${contactsFields.toString()}) VALUES ? ON DUPLICATE KEY UPDATE ${updateClause}`;
  
  try {
    await mysqlConnection.query(q, [insertValues]);
  } catch (error) {
    functions.logger.error(`Failed to export TurboClientContacts documents: ${error}`);
    throw error;
  }
  functions.logger.log(`UPSERTed ${insertValues.length} TurboClientContacts documents`);

  // Cleanup stale rows (older than 2 minutes)
  const cleanupQuery = "DELETE FROM TurboClientContacts WHERE timestamp < UTC_TIMESTAMP() - INTERVAL 2 MINUTE";
  try {
    const cleanupResult = await mysqlConnection.query(cleanupQuery);
    functions.logger.debug("Cleaned up stale TurboClientContacts rows");
    functions.logger.debug(cleanupResult[0]);
  } catch (error) {
    functions.logger.error(`Failed to cleanup stale TurboClientContacts rows: ${error}`);
    throw error;
  }

  return insertValues.length;
}

/*
exportTurboVendors(): Export TurboVendorsWriteback documents to MySQL TurboVendors table.
These are vendors that have been written back from Turbo (PocketBase) via the expenses writeback endpoint.
Uses UPSERT pattern with timestamp-based cleanup for stale rows.
*/
export async function exportTurboVendors(mysqlConnection: Connection) {
  functions.logger.debug("exporting TurboVendors");
  const allVendorsQuerySnap = await db.collection("TurboVendorsWriteback").get();
  
  if (allVendorsQuerySnap.empty) {
    functions.logger.log("No TurboVendorsWriteback documents to export");
    return;
  }

  const vendorsFields = ["id", "name", "alias", "status", "timestamp"];
  const now = new Date();

  const insertValues = allVendorsQuerySnap.docs.map((vendorSnap) => {
    const vendor = vendorSnap.data();
    return [
      vendorSnap.id, // id (PocketBase ID used as doc key)
      vendor.name || null,
      vendor.alias || null,
      vendor.status || null,
      now,
    ];
  });

  // UPSERT the TurboVendors data into the MySQL table
  const updateClause = vendorsFields
    .filter(x => x !== "id")
    .map(x => `${x}=VALUES(${x})`)
    .join(", ");
  const q = `INSERT INTO TurboVendors (${vendorsFields.toString()}) VALUES ? ON DUPLICATE KEY UPDATE ${updateClause}`;
  
  try {
    await mysqlConnection.query(q, [insertValues]);
  } catch (error) {
    functions.logger.error(`Failed to export TurboVendors documents: ${error}`);
    throw error;
  }
  functions.logger.log(`UPSERTed ${insertValues.length} TurboVendors documents`);

  // Cleanup stale rows (older than 2 minutes)
  const cleanupQuery = "DELETE FROM TurboVendors WHERE timestamp < UTC_TIMESTAMP() - INTERVAL 2 MINUTE";
  try {
    const cleanupResult = await mysqlConnection.query(cleanupQuery);
    functions.logger.debug("Cleaned up stale TurboVendors rows");
    functions.logger.debug(cleanupResult[0]);
  } catch (error) {
    functions.logger.error(`Failed to cleanup stale TurboVendors rows: ${error}`);
    throw error;
  }
}

/*
exportTurboPurchaseOrders(): Export TurboPurchaseOrdersWriteback documents to MySQL TurboPurchaseOrders table.
These are purchase orders that have been written back from Turbo (PocketBase) via the expenses writeback endpoint.
Uses UPSERT pattern with timestamp-based cleanup for stale rows.
Must be called AFTER exportTurboVendors due to foreign key constraint.
*/
export async function exportTurboPurchaseOrders(mysqlConnection: Connection) {
  functions.logger.debug("exporting TurboPurchaseOrders");
  const allPOsQuerySnap = await db.collection("TurboPurchaseOrdersWriteback").get();
  
  if (allPOsQuerySnap.empty) {
    functions.logger.log("No TurboPurchaseOrdersWriteback documents to export");
    return;
  }

  const poFields = [
    "id",
    "poNumber",
    "vendorId",
    "vendorName",
    "uid",
    "job",
    "jobDescription",
    "division",
    "divisionName",
    "total",
    "approvalTotal",
    "date",
    "endDate",
    "approved",
    "approverUid",
    "secondApproval",
    "secondApproverUid",
    "prioritySecondApproverUid",
    "cancelled",
    "cancellerUid",
    "closed",
    "closerUid",
    "rejected",
    "rejectorUid",
    "rejectionReason",
    "paymentType",
    "type",
    "frequency",
    "status",
    "category",
    "parentPo",
    "branch",
    "attachment",
    "attachment_hash",
    "timestamp",
  ];
  const now = new Date();

  const insertValues = allPOsQuerySnap.docs.map((poSnap) => {
    const po = poSnap.data();
    return [
      poSnap.id, // id (PocketBase ID used as doc key)
      po.poNumber || null,
      po.vendorId || null,
      po.vendorName || null,
      po.uid || null,
      po.job || null,
      po.jobDescription || null,
      po.division || null,
      po.divisionName || null,
      po.total ?? null,
      po.approvalTotal ?? null,
      po.date || null,
      po.endDate || null,
      po.approved || null,
      po.approverUid || null,
      po.secondApproval || null,
      po.secondApproverUid || null,
      po.prioritySecondApproverUid || null,
      po.cancelled || null,
      po.cancellerUid || null,
      po.closed || null,
      po.closerUid || null,
      po.rejected || null,
      po.rejectorUid || null,
      po.rejectionReason || null,
      po.paymentType || null,
      po.type || null,
      po.frequency || null,
      po.status || null,
      po.category || null,
      po.parentPo || null,
      po.branch || null,
      po.attachment || null,
      po.attachmentHash || null,
      now,
    ];
  });

  // UPSERT the TurboPurchaseOrders data into the MySQL table
  const updateClause = poFields
    .filter(x => x !== "id")
    .map(x => `${x}=VALUES(${x})`)
    .join(", ");
  const q = `INSERT INTO TurboPurchaseOrders (${poFields.toString()}) VALUES ? ON DUPLICATE KEY UPDATE ${updateClause}`;
  
  try {
    await mysqlConnection.query(q, [insertValues]);
  } catch (error) {
    functions.logger.error(`Failed to export TurboPurchaseOrders documents: ${error}`);
    throw error;
  }
  functions.logger.log(`UPSERTed ${insertValues.length} TurboPurchaseOrders documents`);

  // Cleanup stale rows (older than 2 minutes)
  const cleanupQuery = "DELETE FROM TurboPurchaseOrders WHERE timestamp < UTC_TIMESTAMP() - INTERVAL 2 MINUTE";
  try {
    const cleanupResult = await mysqlConnection.query(cleanupQuery);
    functions.logger.debug("Cleaned up stale TurboPurchaseOrders rows");
    functions.logger.debug(cleanupResult[0]);
  } catch (error) {
    functions.logger.error(`Failed to cleanup stale TurboPurchaseOrders rows: ${error}`);
    throw error;
  }
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
export async function exportProfiles(mysqlConnection: Connection) {
  // const start = process.hrtime.bigint();
  functions.logger.debug("exporting profiles");
  // Get specified fields from all profiles and store them in an array of arrays
  // to be used in the INSERT query
  const allProfilesQuerySnap = await db.collection("Profiles").get();
  const profilesFields = ["id", "surname", "givenName", "openingDateTimeOff", "openingOP", "openingOV", "untrackedTimeOff", "timestamp", "defaultChargeOutRate", "email", "userSourceAnchor64", "userSourceAnchor", "mobilePhone", "jobTitle", "azureId", "salary", "defaultDivision", "managerUid", "managerName", "timeSheetExpected", "payrollId", "offRotation", "personalVehicleInsuranceExpiry", "allowPersonalReimbursement", "bot", "skipMinTimeCheckOnNextBundle", "workWeekHours", "alternateManager", "location", "location_time", "doNotAcceptSubmissions", "msGraphDataUpdated", "customClaims", "defaultBranch"];
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
    profile.openingDateTimeOff = format(utcToZonedTime(stamp.toDate(),APP_NATIVE_TZ), "yyyy-MM-dd")
    if (profile.personalVehicleInsuranceExpiry !== null && profile.personalVehicleInsuranceExpiry !== undefined) {
      profile.personalVehicleInsuranceExpiry = format(utcToZonedTime(profile.personalVehicleInsuranceExpiry.toDate(),APP_NATIVE_TZ), "yyyy-MM-dd")
    }
    if (profile.location_time !== null && profile.location_time !== undefined) {
      profile.location_time = profile.location_time.toDate()
    }
    if (profile.msGraphDataUpdated !== null && profile.msGraphDataUpdated !== undefined) {
      profile.msGraphDataUpdated = profile.msGraphDataUpdated.toDate()
    }
    profile.customClaims = Object.keys(profile.customClaims).join(",")
    return profilesFields.map(x => profile[x]);
  });
  // UPSERT the Profiles data into the MySQL table NOTE: Profiles that have been
  // deleted from Firestore will remain in MySQL. For this reason we delete all
  // rows where the timestamp is older than expected. We can safely assume that
  // 5 minutes prior to now is too old.
  const q = `INSERT INTO Profiles (${profilesFields.toString()}) VALUES ? ON DUPLICATE KEY UPDATE surname=VALUES(surname), givenName=VALUES(givenName), openingDateTimeOff=VALUES(openingDateTimeOff), openingOP=VALUES(openingOP), openingOV=VALUES(openingOV), untrackedTimeOff=VALUES(untrackedTimeOff), timestamp=UTC_TIMESTAMP(), defaultChargeOutRate=VALUES(defaultChargeOutRate), email=VALUES(email), userSourceAnchor64=VALUES(userSourceAnchor64), userSourceAnchor=VALUES(userSourceAnchor), mobilePhone=VALUES(mobilePhone), jobTitle=VALUES(jobTitle), azureId=VALUES(azureId), salary=VALUES(salary), defaultDivision=VALUES(defaultDivision), managerUid=VALUES(managerUid), managerName=VALUES(managerName), timeSheetExpected=VALUES(timeSheetExpected), payrollId=VALUES(payrollId), offRotation=VALUES(offRotation), personalVehicleInsuranceExpiry=VALUES(personalVehicleInsuranceExpiry), allowPersonalReimbursement=VALUES(allowPersonalReimbursement), bot=VALUES(bot), skipMinTimeCheckOnNextBundle=VALUES(skipMinTimeCheckOnNextBundle), workWeekHours=VALUES(workWeekHours), alternateManager=VALUES(alternateManager), location=VALUES(location), location_time=VALUES(location_time), doNotAcceptSubmissions=VALUES(doNotAcceptSubmissions), msGraphDataUpdated=VALUES(msGraphDataUpdated), customClaims=VALUES(customClaims), defaultBranch=VALUES(defaultBranch)`;
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
  functions.logger.debug("Cleaned up stale Profiles rows");

  // The affectedRows property is the number of rows that were deleted, but I'm
  // lazy and this is typescript so I'm just going to show the whole object
  // instead of declaring a type and then using it to extract the property
  functions.logger.debug(cleanupResult[0]);
}

/*
writebackProfiles(): Write back the usedOV and usedOP, mileageClaimed and
mileageClaimedSince values to the Profiles collection. This is done by
retrieving the Profiles data from MySQL and then updating the Firestore
documents.
*/

export async function writebackProfiles(mysqlConnection: Connection) {
  // Load and run the query
  functions.logger.debug("writing back profiles");
  const mileageSql = loadSQLFileToString("mileageClaimed");
  const timeOffSql = loadSQLFileToString("timeOffTallies");

  const [mr, _fields0] = await mysqlConnection.query(mileageSql);
  const [tr, _fields1] = await mysqlConnection.query(timeOffSql);
  functions.logger.debug("got mileage and time off tallies");

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
      const [rr, _fields2] = await mysqlConnection.query(mileageResetSql);
      const resetRows = rr as RowDataPacket[];
      if (resetRows.length === 1) {
        functions.logger.debug(`mileageClaimedSince set to ${resetRows[0]["MAX(date)"]} from SQL query`);
        mileageClaimedSince = new Date(resetRows[0]["MAX(date)"]);
        // NOTE: at this point mileageClaimedSince isn't set to 11:59:59.999 PM
        // on the date in EST but it will likely suffice as a temporary date
        // since as soon as actual data is being synced the date will be
        // updated.  TODO: set mileageClaimedSince to 11:59:59.999 PM on the
        // date in EST
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

      // The UI must handle a null value for usedAsOf. This is to be interpreted
      // as no time off has been used since the last reset.
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

/*
exportInvoices(): 
This involves exporting the line items to one each with a new ID then exporting
the data related to the whole invoice to another table. There will be no
facility to update invoices in MySQL since no updates are allowed in Firestore.
However it will be possible to manually deleted invoices in Firestore and in
this case the corresponding rows in MySQL will also need to be deleted.
*/
export async function exportInvoices(mysqlConnection: Connection) {
  // 1. export invoices where exported: false and replaced: false, then set
  //    exported: true
  const start = process.hrtime.bigint();

  // get the invoices to export
  const batchSize = 499;  
  const pendingExportQuery = db
    .collection("Invoices")
    .where("exported", "==", false)
    .where("replaced", "==", false)
    .limit(batchSize);

  const exportLocksDoc = db.collection("Locks").doc("exportInProgress");

  // Run the query and set the flag exportInProgress:true. At the same time
  // create a batch to delete the exportInProgress:true flag that will be run
  // only if the export fails. The purpose of this code is prevent changes to
  // these docs while they are being exported to mysql. This is a manual
  // document-locking mechanism that can span a longer time than a transaction
  // during the exportInvoices() function call
  const [invoiceDocSnaps, exportFailBatch] = await db.runTransaction(async t => {
    const rollbackBatch = db.batch();
    const lockDoc = await t.get(exportLocksDoc);
    if (lockDoc.exists) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "exportInvoices(): an export is already running"
      );
    }
    const invoiceSnaps = await t.get(pendingExportQuery);
    const docs:admin.firestore.QueryDocumentSnapshot[] = [];
    invoiceSnaps.forEach(invoiceSnap => {
      // skip the Invoices doc if prerequisites aren't met
      if (
        invoiceSnap.get("exportInProgress") === true || // another export is running
        invoiceSnap.get("exported") === true || // the Invoice is already exported
        invoiceSnap.get("replaced") === true // the Invoice has been replaced
      ) {
        // skip this TimeSheets document
        return;
      }
      docs.push(invoiceSnap);
      rollbackBatch.update(invoiceSnap.ref, {
        exportInProgress: admin.firestore.FieldValue.delete(),
      });
      t.update(invoiceSnap.ref, { exportInProgress: true });
    });
    t.set(exportLocksDoc,{ message: "exportInvoices() transaction created this " +
      "doc to prevent other instances of exportX() from " +
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

  // Iterate over the Invoices documents, INSERTing them and their corresponding
  // LineItems into the respective MySQL tables
  const invoiceResults = invoiceDocSnaps.map(async invoiceSnap => {
    const snapData = invoiceSnap.data();
    const invoice = {
      id: invoiceSnap.id,
      billingNumber: snapData.billingNumber,
      creatorUid: snapData.creatorUid,
      creatorName: snapData.creatorName,
      createdDate: snapData.createdDate.toDate(),
      job: snapData.job,
      number: snapData.number,
      revisionNumber: snapData.revisionNumber,
      date: format(utcToZonedTime(snapData.date.toDate(),APP_NATIVE_TZ), "yyyy-MM-dd"),
    };

    // Insert the Invoice-level data into the Invoices table first
    const invoiceSQLResponse = mysqlConnection.query("INSERT INTO Invoices SET ?", [invoice]);
    
    // Get the lineItems then INSERT them into MySQL in the transaction
    const lineItemsFields = ["invoiceid", "amount", "lineType", "description"];
    const lineItems: InvoiceLineObject[] = invoiceSnap.get("lineItems");
    const insertValues = lineItems.map((lineItem: InvoiceLineObject) => {
      const cleaned: any = lineItem;
      cleaned.invoiceid = invoiceSnap.id;
      return lineItemsFields.map(x => cleaned[x]);
    });
    const q = `INSERT INTO InvoiceLineItems (${lineItemsFields.toString()}) VALUES ?`;
    const lineItemsSQLResponse = mysqlConnection.query(q, [insertValues]);

    try {
      await Promise.all([invoiceSQLResponse, lineItemsSQLResponse]);
    } catch (error) {
      functions.logger.error(`Failed to export Invoices document ${invoice.id} ${invoice.job} ${invoice.number} rev ${invoice.revisionNumber}: ${error}`);
      throw error
    }

    // INSERTs were successful for this doc, mark it in success batch
    return exportSuccessBatch.update(invoiceSnap.ref, {
      exported: true,
      exportInProgress: admin.firestore.FieldValue.delete(),
    });
  });

  try {
    await Promise.all(invoiceResults);
    await mysqlConnection.query( "COMMIT;");
    // delete exportInProgress:true property, set exported:true on local docs
    await exportSuccessBatch.commit();
    const end = process.hrtime.bigint();
    const elapsed = (end - start) / BigInt(1000000000);
    functions.logger.log(`Exported ${invoiceResults.length} Invoices documents in ${elapsed.toString()} sec`);
  } catch (error) {
    await mysqlConnection.query( "ROLLBACK;");
    // delete exportInProgress:true property on local docs
    await exportFailBatch.commit();
    functions.logger.error(`Export failed ${error}`);
  }

  await mysqlConnection.query( "SET FOREIGN_KEY_CHECKS=1;");
  return exportLocksDoc.delete();
}

/*
deleteReplacedInvoices():
delete invoices where exported: true and replaced: true, then set exported:
false in firestore
*/
export async function deleteReplacedInvoices(mysqlConnection: Connection){
  functions.logger.debug("deleteReplacedInvoices()");
  // get invoices in firestore where exported: true and replaced: true
  const batchSize = 499;
  const pendingDeletionQuery = db
    .collection("Invoices")
    .where("exported", "==", true)
    .where("replaced", "==", true)
    .limit(batchSize);
  const batch = db.batch();

  // for each invoice, delete the Invoices row with the matching id. The ON
  // CASCADE of TimeEntries will automatically delete the entries so we don't
  // have to handle that here.
  await mysqlConnection.query( "START TRANSACTION;");

  const invoiceDocSnaps = await pendingDeletionQuery.get();
  const invoiceResults = invoiceDocSnaps.docs.map(async invoiceSnap => {
    const invoiceid = invoiceSnap.id;
    const q = "DELETE FROM Invoices WHERE id=?";
    const invoiceSQLResponse = mysqlConnection.query(q, [invoiceid]);
    try {
      await invoiceSQLResponse;
    } catch (error) {
      functions.logger.error(`Failed to delete Invoices document ${invoiceid}: ${error}`);
      throw error
    }
    return batch.update(invoiceSnap.ref, {
      exported: false,
    });
  });

  try {
    await Promise.all(invoiceResults);
    await mysqlConnection.query( "COMMIT;");
    return batch.commit();
  } catch (error) {
    functions.logger.error(`Delete failed ${error}`);
    return mysqlConnection.query( "ROLLBACK;");
  }
}