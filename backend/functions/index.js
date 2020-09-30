// Entry point for tybalt app

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
admin.firestore().settings({timestampsInSnapshots: true});

const rawLoginsModule = require('./rawLogins.js')
//const azureModule = require('./azure.js')
const claimsModule = require('./claims.js')
const computersModule = require('./computers.js')
const timesheetsModule = require('./timesheets.js')

// Get a raw login and update Computers, Logins, and Users. If it's somehow
// incorrect, write it to RawLogins collection for later processing
exports.rawLogins = functions.https.onRequest((req, res) => {
  rawLoginsModule.handler(req, res, admin.firestore());
});

// Get a Custom Firebase token by sending the right info to this endpoint
// TODO: remove this function and use the new built-in Microsoft provider
//exports.getToken = functions.https.onRequest(async (req, res) => {
//  azureModule.handler(req, res, admin.firestore());
//});

// Dump the claims for each user in firebase Authentication to corresponding
// document in 'Profiles' collection.
exports.claimsToProfiles = functions.https.onCall(async (data, context) => {
  return claimsModule.claimsToProfiles(data,context, admin.firestore());
});

// modify the custom claims in firebase Authentication
exports.modClaims = functions.https.onCall(async (data, context) => {
  return claimsModule.modClaims(data, context, admin.firestore());
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
const cleanup_trigger = function (snap, context) {
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
exports.rawLoginsCleanup = functions.firestore.document('RawLogins/{loginId}').onCreate(cleanup_trigger);

// add week_ending property to TimeEntries on create or update
exports.writeWeekEnding = functions.firestore.document('TimeEntries/{entryId}').onWrite(timesheetsModule.writeWeekEnding);
