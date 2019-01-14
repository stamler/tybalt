const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const rawLoginsModule = require('./rawLogins.js')

// Get a raw login and update Computers, Logins, and Users. If it's somehow
// incorrect, write it to RawLogins collection for later processing
exports.rawLogins = functions.https.onRequest((req, res) => {
  rawLoginsModule.handler(req, res, admin.firestore());
});