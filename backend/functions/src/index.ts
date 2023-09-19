/*
 * @Author: Dean Stamler 
 * @Date: 2018-01-01 12:00:00 
 */

// Entry point for tybalt app

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
admin.firestore().settings({ timestampsInSnapshots: true });

import { writeWeekEnding, writeExpensePayPeriodEnding } from "./utilities";
import { unbundleTimesheet, lockTimesheet, unlockTimesheet, exportOnAmendmentCommit, commitTimeAmendment } from "./timesheets";
import { updateAuth, createProfile, deleteProfile, updateProfileFromMSGraph } from "./profiles";
import { updateAlgoliaIndex, jobSearchKeys, profileFilter, divisionsFilter } from "./algolia";
import { cleanUpUnusedAttachments, generateExpenseAttachmentArchive } from "./storage";
import { emailOnReject, emailOnShare } from "./email";
export { rawLogins, rawLoginsCleanup } from "./rawLogins";
export { cleanUpOrphanedAttachment } from "./expenses";
export { bundleTimesheet } from "./bundleTimesheets";
export { assignComputerToUser } from "./computers";
export { currentADDump } from "./syncUsersFromOnPrem";
export { updateTimeTracking, manuallyUpdateTimeTracking, updateViewers, auditTimeTracking } from "./timesheets";
export { updatePayrollFromTimeTracking, updatePayrollFromExpenses } from "./payroll";
export { updateExpenseTracking, expenseRates, uncommitExpense, submitExpense } from "./expenses";
export { writeFileLinks } from "./utilities";
export { algoliaUpdateSecuredAPIKey, updateOpeningValues /*, getMileageForUids*/ } from "./profiles";
export { scheduledFirestoreExport } from "./export";
export { syncToSQL } from "./sync";
export { queryMySQL } from "./endpoint";
export { newAiChat, deleteChat, aiResponder, retryAiChat } from "./ai";
export { deleteJob, fullSyncLastTimeEntryDate, updateLastTimeEntryDate, clearLastTimeEntryDate } from "./jobs";
export { auditExportStatus } from "./audit";
export { addMutation, deleteMutation, dispatchMutations, mutationComplete, approveMutation } from "./mutations";
export { scheduledSubmitReminder, scheduledEmailCleanup, scheduledExpenseApprovalReminder, scheduledTimeSheetApprovalReminder } from "./email";
export { wgCreateKeylessClient, wgToggleEnableClient, wgDeleteClient, wgPeersIni, wgSetPublicKey, wgClearPublicKey } from "./wireguard";
export { checkIn, createVacation } from "./presence";

// send emails when timesheets are shared
exports.emailOnTimeSheetShare = functions.firestore
  .document("TimeSheets/{timesheetId}")
  .onUpdate(async (change, context) => { await emailOnShare(change, context, "TimeSheets") });

// send emails when timesheets are rejected
exports.emailOnTimeSheetRejection = functions.firestore
  .document("TimeSheets/{timesheetId}")
  .onUpdate(async (change, context) => { await emailOnReject(change, context, "TimeSheets") });

// send emails when expenses are rejected
exports.emailOnExpenseRejection = functions.firestore
  .document("Expenses/{expenseId}")
  .onUpdate(async (change, context) => { await emailOnReject(change, context, "Expenses") });

// update algolia indexes
exports.algoliaUpdateJobsIndex = functions.firestore
  .document("Jobs/{jobId}")
  .onWrite((change, context) => {
    return updateAlgoliaIndex({change, context, indexName: "tybalt_jobs", searchKeysFunction: jobSearchKeys});
  });
exports.algoliaUpdateProfilesIndex = functions.firestore
  .document("Profiles/{profileId}")
  .onWrite((change, context) => {
    return updateAlgoliaIndex({change, context, indexName: "tybalt_profiles", allowedFields: ["displayName", "givenName", "surname"], filterFunction: profileFilter });
  });
exports.algoliaUpdateDivisionsIndex = functions.firestore
  .document("Divisions/{divisionId}")
  .onWrite((change, context) => {
    return updateAlgoliaIndex({change, context, indexName: "tybalt_divisions", filterFunction: divisionsFilter });
  });

// immediately prior to attempting to upload an expense attachment,
// clean up the existing attachments in case there are orphans from previous
// uploads
exports.cleanUpUsersExpenseAttachments = functions.https.onCall(cleanUpUnusedAttachments);

// call from client to generate a zip file of expense attachments for a given document ID or payPeriodEnding
exports.generateExpenseAttachmentArchive = functions.runWith({memory: "2GB", timeoutSeconds: 180}).https.onCall(generateExpenseAttachmentArchive);

// unbundle a timesheet
exports.unbundleTimesheet = functions.https.onCall(unbundleTimesheet);

// lock approved timesheets individually by TimeSheet doc id
exports.lockTimesheet = functions.https.onCall(lockTimesheet);

// unlock approved timesheets individually by TimeSheet doc id
exports.unlockTimesheet = functions.https.onCall(unlockTimesheet);

// return expense documents associated with a pay period
// replaced by payablesPayrollCSV.sql
// exports.getPayPeriodExpenses = functions.https.onCall(getPayPeriodExpenses);

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

// update the Firebase Auth Custom Claims from the corresponding Profile doc
exports.updateAuth = functions.firestore
  .document("Profiles/{uid}")
  .onWrite(updateAuth);

// create and delete profiles
exports.createProfile = functions.auth.user().onCreate(createProfile);
exports.deleteProfile = functions.auth.user().onDelete(deleteProfile);

// update a profile from the MS Graph
exports.updateProfileFromMSGraph = functions.https.onCall(updateProfileFromMSGraph);
