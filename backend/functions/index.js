// Entry point for tybalt app

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
admin.firestore().settings({timestampsInSnapshots: true});

const rawLoginsModule = require('./rawLogins.js')
const computersModule = require('./computers.js')
const timesheetsModule = require('./timesheets.js')
const profilesModule = require('./profiles.js')

// Get a raw login and update Computers, Logins, and Users. If it's somehow
// incorrect, write it to RawLogins collection for later processing
exports.rawLogins = functions.https.onRequest((req, res) => {
  rawLoginsModule.handler(req, res, admin.firestore());
});

// assign a user to a computer
exports.assignComputerToUser = functions.https.onCall(async (data, context) => {
  return computersModule.assignComputerToUser(data, context, admin.firestore());
});

// bundle a timesheet
exports.bundleTimesheet = functions.https.onCall(async (data, context) => {
  return timesheetsModule.bundleTimesheet(data, context, admin.firestore());
});

// unbundle a timesheet
exports.unbundleTimesheet = functions.https.onCall(async (data, context) => {
  return timesheetsModule.unbundleTimesheet(data, context, admin.firestore());
});

// cleanup RawLogins with computerName
//exports.cleanup = functions.https.onCall(async (data, context) => {
//  return rawLoginsModule.cleanup(data, context, admin.firestore())
//});
const cleanupTrigger = function (snap, context) {
  return rawLoginsModule.cleanup(snap.data(), context, admin.firestore())
}

const writeCreated = function (snap, context) {
  return snap.ref.set({ created: admin.firestore.FieldValue.serverTimestamp() }, { merge: true } );
}

// Write the created timestamp on created Documents
exports.computersCreatedDate = functions.firestore.document('Computers/{computerId}').onCreate(writeCreated);
exports.loginsCreatedDate = functions.firestore.document('Logins/{loginId}').onCreate(writeCreated);
exports.rawLoginsCreatedDate = functions.firestore.document('RawLogins/{loginId}').onCreate(writeCreated);
exports.usersCreatedDate = functions.firestore.document('Users/{loginId}').onCreate(writeCreated);

// Cleanup old RawLogins onCreate
exports.rawLoginsCleanup = functions.firestore.document('RawLogins/{loginId}').onCreate(cleanupTrigger);

// add weekEnding property to TimeEntries on create or update
exports.writeWeekEnding = timesheetsModule.writeWeekEnding;

// update the Firebase Auth Custom Claims from the corresponding Profile doc
exports.updateAuth = functions.firestore.document('Profiles/{uid}').onWrite(profilesModule.updateAuth);

// create a Profile when a new user is created in Firebase Auth
exports.createProfile = functions.auth.user().onCreate((user) => {
  return profilesModule.createProfile(user, admin.firestore());
});

// delete a Profile when a user is deleted in Firebase Auth
exports.deleteProfile = functions.auth.user().onDelete((user) => {
  return profilesModule.deleteProfile(user, admin.firestore());
});
