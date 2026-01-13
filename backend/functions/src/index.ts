/*
 * @Author: Dean Stamler 
 * @Date: 2018-01-01 12:00:00 
 */

// Entry point for tybalt app

import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

admin.initializeApp();
admin.firestore().settings({ timestampsInSnapshots: true });

import { writeWeekEnding } from "./utilities";
import { updateAlgoliaIndex, jobSearchKeys, profileFilter, divisionsFilter } from "./algolia";
import { FUNCTIONS_CONFIG_SECRET } from "./secrets";
import { emailOnReject, emailOnShare } from "./email";
export { generateExpenseAttachmentArchive, cleanUpUsersExpenseAttachments, cleanUpUsersPurchaseOrderRequestAttachments } from "./storage";
export { updateAuthAndManager, createProfile, deleteProfile, updateProfileFromMSGraph, algoliaUpdateSecuredAPIKey, updateOpeningValues } from "./profiles";
export { rawLogins, rawLoginsCleanup } from "./rawLogins";
export { bundleTimesheet } from "./bundleTimesheets";
export { assignComputerToUser } from "./computers";
export { currentADDump } from "./syncUsersFromOnPrem";
export { updateTimeTracking, manuallyUpdateTimeTracking, updateViewers, auditTimeTracking, unbundleTimesheet, lockTimesheet, unlockTimesheet, exportOnAmendmentCommit, commitTimeAmendment } from "./timesheets";
export { updatePayrollFromTimeTracking, updatePayrollFromExpenses } from "./payroll";
export { updateExpenseTracking, rebuildExpenseTracking, expenseRates, uncommitExpense, submitExpense, cleanUpOrphanedAttachment } from "./expenses";
export { writeFileLinks, expensesPayPeriodEnding } from "./utilities";
export { scheduledFirestoreExport } from "./export";
export { syncToSQL } from "./sync";
export { queryMySQL } from "./endpoint";
export { deleteJob, fullSyncLastTimeEntryDate, updateLastTimeEntryDate, clearLastTimeEntryDate } from "./jobs";
export { addMutation, deleteMutation, dispatchMutations, mutationComplete, approveMutation } from "./mutations";
export { scheduledSubmitReminder, scheduledEmailCleanup, scheduledExpenseApprovalReminder, scheduledTimeSheetApprovalReminder } from "./email";
export { wgCreateKeylessClient, wgToggleEnableClient, wgDeleteClient, wgPeersIni, wgSetPublicKey, wgClearPublicKey } from "./wireguard";
export { checkIn, createVacation } from "./presence";
export { createInvoice } from "./invoices";
export { scheduledTurboJobsWritebackSync } from "./turboSync";

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
exports.algoliaUpdateJobsIndex = functions
  .runWith({ secrets: [FUNCTIONS_CONFIG_SECRET] })
  .firestore.document("Jobs/{jobId}")
  .onWrite((change, context) => {
    return updateAlgoliaIndex({change, context, indexName: "tybalt_jobs", searchKeysFunction: jobSearchKeys});
  });
exports.algoliaUpdateProfilesIndex = functions
  .runWith({ secrets: [FUNCTIONS_CONFIG_SECRET] })
  .firestore.document("Profiles/{profileId}")
  .onWrite((change, context) => {
    return updateAlgoliaIndex({change, context, indexName: "tybalt_profiles", allowedFields: ["displayName", "givenName", "surname"], filterFunction: profileFilter });
  });
exports.algoliaUpdateDivisionsIndex = functions
  .runWith({ secrets: [FUNCTIONS_CONFIG_SECRET] })
  .firestore.document("Divisions/{divisionId}")
  .onWrite((change, context) => {
    return updateAlgoliaIndex({change, context, indexName: "tybalt_divisions", filterFunction: divisionsFilter });
  });

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
