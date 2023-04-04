
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { getAuthObject } from "./utilities";
import { APP_NATIVE_TZ } from "./config";
import { createSSHMySQLConnection2 } from "./sshMysql";
import { loadSQLFileToString } from "./sqlQueries";
import { RowDataPacket } from "mysql2";
import * as _ from "lodash";
import { subDays } from "date-fns";
import { zonedTimeToUtc } from "date-fns-tz";


const db = admin.firestore();

// A callable cloud function to delete a job from firestore.
export const deleteJob = functions.https.onCall(async (data, context) => {
  const { id } = data;

  // throw if the caller isn't authenticated & authorized
  getAuthObject(context, ["admin"]);

  // delete the job. Throw if the job doesn't exist
  try {
    await db.collection("Jobs").doc(id).delete();
  } catch (error: any) {
    if (error?.code === "not-found") {
      throw new functions.https.HttpsError("not-found", "Job not found");
    } else {
      throw new functions.https.HttpsError("internal", error.message);
    }
  }
});

// this function is called by a cloud scheduler job at 8pm every day in the
// APP_NATIVE_TZ timezone. It's purpose is to mark jobs as stale if they have
// had no TimeEntries in the last STALE_JOB_AGE days AND have no excuse. For now
// the excuse is having an inactivityComment in the last STALE_JOB_AGE days as
// determined by the inactivityCommentDate field.
// 1. query SQL for all jobs with TimeEntries in the last STALE_JOB_AGE days 
// 2. query firestore for all Jobs docs that have active status 
// 3. For each job in firestore, if it's not in the SQL result and it has no
//    excuse (like an inactivityComment), mark it as stale
// const STALE_JOB_AGE = 365;
// export const markStaleJobs = functions.pubsub.schedule("0 20 * * *").timeZone(APP_NATIVE_TZ).onRun(async (context) => {
//   // 1. get all jobIds with TimeEntries in the last 365 days from SQL
//   const sql = loadSQLFileToString("recentJobs"); // This has been deleted when this was commented out
//   const connection = await createSSHMySQLConnection2();
//   const [rows, _fields] = await connection.query(sql, [STALE_JOB_AGE]);
//   const casted = rows as RowDataPacket[];
//   const jobIds = casted.map((x) => x.job);

//   // 2. query firestore for all Jobs docs that have active status 
//   const jobs = await db.collection("Jobs").where("status", "==", "Active").get();
//   const docs = jobs.docs;
//   const [activeJobs, staleJobs] = _.partition(docs, (doc) => {
//     return jobIds.includes(doc.id);
//   });

//   // Account for jobs with a status other than Active which have had time
//   // entries in the last STALE_JOB_AGE days by filtering jobIds
//   const missingInActive = jobIds.filter((id) => {
//     return !activeJobs.map((doc) => doc.id).includes(id);
//   });
//   functions.logger.log(`${missingInActive.length} jobs with time entries in last ${STALE_JOB_AGE} days but without Active status in firestore.`);

//   // get the status of each missingInActive job from the Jobs collection in
//   // Firestore. We cannot use the "in" operator because it only supports up to
//   // 30 comparison values. Instead we have to break it up into batches of 30
//   // and then merge the results.
//   const batchSize = 30;
//   const batches = _.chunk(missingInActive, batchSize);
//   const missingInActiveStatuses = [];
//   for (const batch of batches) {
//     const batchDocs = await db.collection("Jobs").where(admin.firestore.FieldPath.documentId(), "in", batch).get();
//     missingInActiveStatuses.push(...batchDocs.docs.map((doc) => doc.data().status));
//   }
//   const missingInActiveStatusSet = new Set(missingInActiveStatuses);
//   functions.logger.log(`Statuses of ${missingInActiveStatuses.length} jobs with time entries in last ${STALE_JOB_AGE} days but without Active status in firestore: ${Array.from(missingInActiveStatusSet).join(", ")}`); 

//   // Here is the set description of each variable:
//   // jobIds: all jobIds with TimeEntries in the last STALE_JOB_AGE days
//   // docs: all Jobs docs that have active status
//   // activeJobs: jobsIds intersect docs
//   // staleJobs: docs - activeJobs = jobIds complement intersect docs
//   // missingInActive: jobIds - activeJobs = docs complement intersect jobIds

//   // This whole thing could be faster if we just synced jobs from firestore to
//   // SQL

//   functions.logger.info(`${jobIds.length} jobs with time in past ${STALE_JOB_AGE} days. ${docs.length} jobs with "Active" status, into ${staleJobs.length} stale and ${activeJobs.length} active.`);
//   const sample = staleJobs.slice(0, 5);
//   functions.logger.log(JSON.stringify(sample.map(x => x.id)) + "...");
// });

// this function is called by a cloud scheduler job at 8pm every day in the
// APP_NATIVE_TZ timezone. It's purpose is to write a lastTimeEntryDate field to
// each job in firestore. This is used to determine if a job is stale. 
// 1. query SQL for the latest TimeEntry for each job and make a Map of jobId to
//    date
// 2. write the lastTimeEntryDate on documents in the Jobs collection if they
//    have an entry in the Map
async function writeJobsLastTimeEntryDate(fullSync = false) {

  // prevent this function from running if it's already running
  const exportLocksDoc = db.collection("Locks").doc("writeJobsLastTimeEntryDate");
  await db.runTransaction(async t => {
    const lockDoc = await t.get(exportLocksDoc);
    if (lockDoc.exists) {
      functions.logger.warn("writeJobsLastTimeEntryDate() is already running");
      return;
    }
    return t.set(exportLocksDoc,{ message: "writeJobsLastTimeEntryDate() " + 
    "transaction created this doc to prevent other instances of " + 
    "writeJobsLastTimeEntryDate() from running simultaneously."})
  });

  // 1. get the latest date and job for all TimeEntries from SQL
  const sql = loadSQLFileToString("latestTimeEntryForJobs");
  const connection = await createSSHMySQLConnection2();
  const [rows, _fields] = await connection.query(sql);
  const casted = rows as RowDataPacket[];

  // Since the SQL query returns jobs sorted by date descending, we can just
  // find the index of the first job that is older than the syncStartDate and
  // slice the array to that index. This will reduce the number of jobs we have
  // to iterate over in the next step.
  let jobsToUpdate: RowDataPacket[];
  if (!fullSync) {
    // In order to be efficient, we first check the latest value for
    // lastTimeEntryDate in the Jobs collection. We can query SQL for all jobs
    // whose date is no older than 4 weeks prior (to account for uncommitted
    // TimeSheets) to the latest value. This will reduce the number of Jobs
    // documents we have to update. Note that this won't work if an initial run of
    // all Jobs docs isn't done so we'll also have a function that runs once to
    // load all Jobs docs.
    const latestJob = await db.collection("Jobs").orderBy("lastTimeEntryDate", "desc").limit(1).get();
    if (latestJob.empty) {
      functions.logger.warn("No Jobs have a lastTimeEntryDate field. Run a full sync first by calling fullSyncLastTimeEntryDate.");
      return;
    }
    const syncStartDate = subDays(latestJob.docs[0].get("lastTimeEntryDate").toDate(), 28);

    const index = (casted).findIndex((x) => x.date < syncStartDate);
    jobsToUpdate = casted.slice(0, index);
    functions.logger.info(`Updating ${jobsToUpdate.length} jobs with TimeEntries after ${syncStartDate.toISOString().slice(0, 10)}. (${casted.length} total jobs have TimeEntries)`);
  } else {
    jobsToUpdate = casted;
    functions.logger.info(`Updating ${jobsToUpdate.length} jobs with TimeEntries. (Full sync)`);
  }

  // create the latestTimeEntries Map
  const latestTimeEntries = new Map();
  for (const row of jobsToUpdate) {
    latestTimeEntries.set(row.job, row.date);
  }

  // 2. write the lastTimeEntryDate on documents in the Jobs collection if they
  //    have an entry in the Map TODO: This runs for a long time. We should
  //    probably batch it and limit the number of jobs we update per run
  //    somehow.
  
  for (const [jobId, date] of latestTimeEntries) {
    const doc = await db.collection("Jobs").doc(jobId).get();
    if (doc.exists) {
      const timestamp = zonedTimeToUtc(new Date(date), APP_NATIVE_TZ);
      //functions.logger.debug(`Updating lastTimeEntryDate for job ${jobId} to ${date} as ${timestamp.toISOString()}`);
      await doc.ref.update({ lastTimeEntryDate: timestamp, hasTimeEntries: true });
    } else {
      functions.logger.warn(`Job ${jobId} does not exist in firestore.`);
    }
  }

  // delete the lock doc
  return exportLocksDoc.delete();
};

// this function is called by a cloud scheduler job at 8pm every day in the
// APP_NATIVE_TZ timezone. It does the incremental sync of Jobs entry dates from
// SQL to Firestore.
export const updateLastTimeEntryDate = functions.pubsub.schedule("0 20 * * *").timeZone(APP_NATIVE_TZ).onRun(async (context) => {
  return writeJobsLastTimeEntryDate(false);
});

// this callable function is called by the client to do a full sync of Jobs
// entry dates from SQL to Firestore.
export const fullSyncLastTimeEntryDate = functions.runWith({ timeoutSeconds: 240 }).https.onCall(async (data, context) => {
  // throw if the caller isn't authenticated & authorized
  getAuthObject(context, ["admin"]);
  return writeJobsLastTimeEntryDate(true);
});

// this callable function is called by the client to clear the lastTimeEntryDate
// field on all Jobs in Firestore.
export const clearLastTimeEntryDate = functions.runWith({ timeoutSeconds: 360 }).https.onCall(async (data, context) => {
  // throw if the caller isn't authenticated & authorized
  getAuthObject(context, ["admin"]);
  functions.logger.info("Adding hasTimeEntries:false to all docs in the Jobs collection...")
  await addFieldToCollection("Jobs", "hasTimeEntries", () => false, context);
  functions.logger.info("Deleting lastTimeEntryDate field on all docs in the Jobs collection...");
  return deleteFieldFromCollection("Jobs", "lastTimeEntryDate", context);
});

// This function is called by other functions to delete a field from all docs in
// a collection. It is dangerous and destroys data so it should only be used
// when absolutely necessary. It is a long-running operation and care should be
// taken by the caller to ensure that it runs to completion.
async function deleteFieldFromCollection(collection: string, fieldName: string, context: functions.https.CallableContext) {
  // TODO: Please see file-5lj.ts for proposal to replace this script with a more
  // general solution that applies a function to each document in a collection.

  // throw if the caller isn't authenticated & authorized
  getAuthObject(context, ["admin"]);

  // because the maximum batch size is 500, we have to do this in batches
  const batchSize = 499;
  const batches = [];
  let moreRemaining = true;
  while (moreRemaining) {
    // eslint-disable-next-line no-await-in-loop
    const querySnap = await db
      .collection(collection)
      .orderBy(fieldName, "desc")
      .limit(batchSize)
      .get();
    const batch = db.batch();

    querySnap.forEach((docSnap) => {
      batch.update(docSnap.ref, {
        [fieldName]: admin.firestore.FieldValue.delete(),
      });
    });

    moreRemaining = querySnap.size >= batchSize;
    functions.logger.debug(`removing ${fieldName} field from ${querySnap.size} documents`);
    batches.push(batch.commit());
  }
  return Promise.all(batches);
}

// This function is called by other functions to add a field to all docs in a
// collection.
type AllowedFieldValues = string | number | boolean | admin.firestore.Timestamp | admin.firestore.GeoPoint | admin.firestore.DocumentReference | admin.firestore.FieldValue;
type ValueFunction = (docSnap: admin.firestore.QueryDocumentSnapshot) => AllowedFieldValues;

async function addFieldToCollection(collection: string, fieldName: string, valueFn: ValueFunction, context: functions.https.CallableContext) {
  // TODO: Please see file-5lj.ts for proposal to replace this script with a more
  // general solution that applies a function to each document in a collection.

  // throw if the caller isn't authenticated & authorized
  getAuthObject(context, ["admin"]);

  let modifiedDocsCounter = 0;
  const batchSize = 499;
  const batches = [];
  let lastDoc: admin.firestore.QueryDocumentSnapshot | undefined = undefined;
  let querySnap: FirebaseFirestore.QuerySnapshot;
  do {

    let query = db.collection(collection).limit(batchSize)

    if (lastDoc !== undefined) {
      query = query.startAfter(lastDoc);
    }

    querySnap = await query.get();
    const batch = db.batch();

    querySnap.forEach((docSnap) => {
      batch.update(docSnap.ref, {
        [fieldName]: valueFn(docSnap),
      });
      modifiedDocsCounter++;
    });
    lastDoc = querySnap.docs[querySnap.docs.length - 1];

    functions.logger.debug(`adding ${fieldName} field to ${querySnap.size} documents`);
    batches.push(batch.commit());
  } while (querySnap.size >= batchSize);
  await Promise.all(batches);
  functions.logger.info(`added ${fieldName} field to ${modifiedDocsCounter} documents`);
  return;
}