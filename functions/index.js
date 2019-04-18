// Entry point for tybalt app

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
admin.firestore().settings({timestampsInSnapshots: true});

const rawLoginsModule = require('./rawLogins.js')
const azureModule = require('./azure.js')
const claimsModule = require('./claims.js')

// Get a raw login and update Computers, Logins, and Users. If it's somehow
// incorrect, write it to RawLogins collection for later processing
exports.rawLogins = functions.https.onRequest((req, res) => {
  rawLoginsModule.handler(req, res, admin.firestore());
});

// Get a Custom Firebase token by sending the right info to this endpoint
exports.getToken = functions.https.onRequest(async (req, res) => {
  azureModule.handler(req, res, admin.firestore());
});

const writeCreated = function (snap, context) {
  return snap.ref.set({ created: admin.firestore.FieldValue.serverTimestamp() }, { merge: true } );
}

// Write the created timestamp on created Documents
exports.computersCreatedDate = functions.firestore.document('Computers/{computerId}').onCreate(writeCreated);
exports.loginsCreatedDate = functions.firestore.document('Logins/{loginId}').onCreate(writeCreated);
exports.rawLoginsCreatedDate = functions.firestore.document('RawLogins/{loginId}').onCreate(writeCreated);
exports.usersCreatedDate = functions.firestore.document('Users/{loginId}').onCreate(writeCreated);