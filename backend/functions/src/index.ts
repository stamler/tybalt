// Entry point for tybalt app

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
admin.firestore().settings({ timestampsInSnapshots: true });

import * as rawLoginsModule from "./rawLogins";
import { assignComputerToUser } from "./computers";
import { writeWeekEnding, writeExpensePayPeriodEnding } from "./utilities";
import { unbundleTimesheet, lockTimesheet, exportOnAmendmentCommit, commitTimeAmendment } from "./timesheets";
import { bundleTimesheet } from "./bundleTimesheets";
import { updateAuth, createProfile, deleteProfile, updateProfileFromMSGraph } from "./profiles";
import { cleanUpOrphanedAttachment, getPayPeriodExpenses } from "./expenses";
import { updateAlgoliaIndex } from "./algolia";
export { updateTimeTracking } from "./timesheets";
export { updatePayrollFromTimeTracking, updatePayrollFromExpenses } from "./payroll";
export { updateExpenseTracking } from "./expenses";
export { writeFileLinks } from "./utilities";
export { algoliaUpdateSecuredAPIKey } from "./profiles";
export { scheduledFirestoreExport } from "./export";
export { scheduledSubmitReminder } from "./email";

// update algolia indexes
exports.algoliaUpdateJobsIndex = functions.firestore
  .document("Jobs/{jobId}")
  .onWrite((change, context) => {
    return updateAlgoliaIndex(change, context, "tybalt_jobs");
  });

// clean up expense attachments that are orphaned by deletion or update of 
// corresponding expense document
exports.cleanUpOrphanedAttachment = functions.firestore
  .document("Expenses/{expenseId}")
  .onWrite(cleanUpOrphanedAttachment);

// Get a raw login and update Computers, Logins, and Users. If it's somehow
// incorrect, write it to RawLogins collection for later processing
exports.rawLogins = functions.https.onRequest(rawLoginsModule.handler);

// assign a user to a computer
exports.assignComputerToUser = functions.https.onCall(assignComputerToUser);

// bundle a timesheet
exports.bundleTimesheet = functions.https.onCall(bundleTimesheet);

// unbundle a timesheet
exports.unbundleTimesheet = functions.https.onCall(unbundleTimesheet);

// lock approved timesheets individually by TimeSheet doc id
exports.lockTimesheet = functions.https.onCall(lockTimesheet);

// return expense documents associated with a pay period
exports.getPayPeriodExpenses = functions.https.onCall(getPayPeriodExpenses);

const writeCreated = function (
    snap: admin.firestore.DocumentSnapshot,
    context: functions.EventContext
  ) {
    return snap.ref.set(
      { created: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
};
// Write the weekEnding on TimeEntries, TimeAmendments, and Expenses
exports.timeEntriesWeekEnding = functions.firestore
  .document("TimeEntries/{entryId}")
  .onWrite(async (change, context) => { await writeWeekEnding(change, context, "date", "weekEnding") });
exports.timeAmendmentsWeekEnding = functions.firestore
  .document("TimeAmendments/{amendmentId}")
  .onWrite(async (change, context) => { await writeWeekEnding(change, context, "date", "weekEnding") });

// Write the committedWeekEnding on TimeAmendments
exports.timeAmendmentsCommittedWeekEnding = functions.firestore
  .document("TimeAmendments/{amendmentId}")
  .onWrite(async (change, context) => { await writeWeekEnding(change, context, "commitTime", "committedWeekEnding") });

// Write the committedWeekEnding on Expenses
exports.expensesCommittedWeekEnding = functions.firestore
  .document("Expenses/{expenseId}")
  .onWrite(async (change, context) => { await writeWeekEnding(change, context, "commitTime", "committedWeekEnding") });

// Write the payPeriodEnding on Expenses
exports.expensesPayPeriodEnding = functions.firestore
  .document("Expenses/{expenseId}")
  .onWrite(writeExpensePayPeriodEnding);

// commit a TimeAmendment (TODO: include export JSON call here rather than trigger)
exports.commitTimeAmendment = functions.https.onCall(commitTimeAmendment);

// exportJson when a timeAmendment is committed
exports.exportOnAmendmentCommit = functions.firestore
  .document("TimeAmendments/{amendmentId}")
  .onUpdate(exportOnAmendmentCommit);

  // Write the created timestamp on created Documents
exports.computersCreatedDate = functions.firestore
  .document("Computers/{computerId}")
  .onCreate(writeCreated);
exports.loginsCreatedDate = functions.firestore
  .document("Logins/{loginId}")
  .onCreate(writeCreated);
exports.rawLoginsCreatedDate = functions.firestore
  .document("RawLogins/{loginId}")
  .onCreate(writeCreated);
exports.usersCreatedDate = functions.firestore
  .document("Users/{loginId}")
  .onCreate(writeCreated);

// Cleanup old RawLogins onCreate
exports.rawLoginsCleanup = functions.firestore
  .document("RawLogins/{loginId}")
  .onCreate(rawLoginsModule.cleanup);

// update the Firebase Auth Custom Claims from the corresponding Profile doc
exports.updateAuth = functions.firestore
  .document("Profiles/{uid}")
  .onWrite(updateAuth);

// create and delete profiles
exports.createProfile = functions.auth.user().onCreate(createProfile);
exports.deleteProfile = functions.auth.user().onDelete(deleteProfile);

// update a profile from the MS Graph
exports.updateProfileFromMSGraph = functions.https.onCall(updateProfileFromMSGraph);