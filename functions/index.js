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
  const options = {
    app_id: functions.config().azure_app_id || null,
    tenant_ids: functions.config().azure_allowed_tenants || []
  };
  azureModule.handler(req, res, admin.firestore(), options);
});