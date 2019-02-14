const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
admin.firestore().settings({timestampsInSnapshots: true});

const rawLoginsModule = require('./rawLogins.js')
const azureModule = require('./azure.js')

// Get a raw login and update Computers, Logins, and Users. If it's somehow
// incorrect, write it to RawLogins collection for later processing
exports.rawLogins = functions.https.onRequest((req, res) => {
  rawLoginsModule.handler(req, res, admin.firestore());
});

// Get a Custom Firebase token by sending the right info to this endpoint
exports.getToken = functions.https.onRequest(async (req, res) => {
  azureModule.handler(req, res, admin.firestore());
});

// Write the created timestamp on creation of a computers document
// TODO: write the time property on creation of Logins and RawLogins documents
exports.computersCreatedDate = functions.firestore.document('Computers/{computerId}').onCreate(
  (snap, context) => {
    return snap.ref.set({ created: admin.firestore.FieldValue.serverTimestamp() }, { merge: true } );
});

// TODO: Write the updated property on update of Computers, Users, and Cache documents
// then remove corresponding code from within the modules