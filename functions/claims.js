/* 

This module exports callable handlers (functions.https.onCall(<handler_func>))
https://firebase.google.com/docs/functions/callable

*/

const admin = require('firebase-admin');
const functions = require('firebase-functions');

// JSON schema validation
const Ajv = require('ajv')
const schema = require('./ModClaimsActions.schema.json')
const ajv = new Ajv()
const validate = ajv.compile(schema);

// The claimsHandler adds or removes claims to one or more firebase auth() users
exports.modClaims = async (data, context, db) => {
  // Pre-conditions, caller must be authenticated admin role-holder
  if (!context.auth) {
    // Throw an HttpsError so that the client gets the error details
    throw new functions.https.HttpsError("unauthenticated",
      "Caller must be authenticated");
  }
  if (!context.auth.token.customClaims.admin) {
    // Throw an HttpsError so that the client gets the error details
    throw new functions.https.HttpsError("permission-denied",
      "Caller must have admin role");
  }

  // validate the shape of data (with ajv) to make sure the request is sound
  const valid = validate(data);
  if (!valid) {
    throw new functions.https.HttpsError("invalid-argument",
      "The provided data failed validation");
  } 

  // TODO: implement here. Data is valid, user is authed

}

// Dump all claims from firebase auth() users to corresponding profiles
exports.claimsToProfiles = async (data, context, db) => {
  // Pre-conditions, caller must be authenticated admin role-holder
  if (!context.auth) {
    // Throw an HttpsError so that the client gets the error details
    throw new functions.https.HttpsError("unauthenticated",
      "Caller must be authenticated");
  }
  if (!context.auth.token.customClaims.admin) {
    // Throw an HttpsError so that the client gets the error details
    throw new functions.https.HttpsError("permission-denied",
      "Caller must have admin role");
  }
  // Pre-conditions, data must be empty object
  if (!data || // not null or undefined
    !(data === Object(data)) ||// not an object  
    Object.keys(data).length !== 0) { // not an empty object
    throw new functions.https.HttpsError("invalid-argument",
      "No arguments are to be provided for this callable function");
  }

  async function iterateAllUsers(nextPageToken) {
    listUsersResult = await admin.auth().listUsers(1000, nextPageToken);
    
    const batch = db.batch();
    listUsersResult.users.forEach((user) => {
      // Add this user's profile update to the batch
      const profile = db.collection("Profiles").doc(user.uid);
      batch.set(profile, { roles: user.customClaims },{merge: true});
    });
    await batch.commit();
    if (listUsersResult.pageToken) {
      iterateAllUsers(listUsersResult.pageToken); // get next batch of users
    }
  }

  // TODO: Is return needed here?
  return iterateAllUsers().then(() => {
    return {message: "Successfully copied auth() claims to profiles"};
  }).catch((error) => {
    console.log("failed copying auth claims to profiles");
    // TODO: ISSUE this throw isn't being turned into a promise!?
    // https://stackoverflow.com/questions/33445415/javascript-promises-reject-vs-throw
    return Promise.reject(new functions.https.HttpsError("internal", error.message));
  });
}