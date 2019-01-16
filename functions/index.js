const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const rawLoginsModule = require('./rawLogins.js')

// TODO: more es6 — https://codeburst.io/es6-in-cloud-functions-for-firebase-959b35e31cb0

// Get a raw login and update Computers, Logins, and Users. If it's somehow
// incorrect, write it to RawLogins collection for later processing
exports.rawLogins = functions.https.onRequest((req, res) => {
  rawLoginsModule.handler(req, res, admin.firestore());
});