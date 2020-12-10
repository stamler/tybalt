// Entry point for tybalt app

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
admin.firestore().settings({ timestampsInSnapshots: true });

import * as rawLoginsModule from "./rawLogins";
import { assignComputerToUser } from "./computers";
import { bundleTimesheet, unbundleTimesheet, lockTimesheets } from "./timesheets";
export {writeWeekEnding, writeFileLinks, updateTimeTracking} from "./timesheets";
import { updateAuth, createProfile, deleteProfile } from "./profiles";

// Get a raw login and update Computers, Logins, and Users. If it's somehow
// incorrect, write it to RawLogins collection for later processing
exports.rawLogins = functions.https.onRequest(rawLoginsModule.handler);

// assign a user to a computer
exports.assignComputerToUser = functions.https.onCall(assignComputerToUser);

// bundle a timesheet
exports.bundleTimesheet = functions.https.onCall(bundleTimesheet);

// unbundle a timesheet
exports.unbundleTimesheet = functions.https.onCall(unbundleTimesheet);

// lock approved timesheets
exports.lockTimesheets = functions.https.onCall(lockTimesheets);


const writeCreated = function (
    snap: admin.firestore.DocumentSnapshot,
    context: functions.EventContext
  ) {
    return snap.ref.set(
      { created: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
};

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
