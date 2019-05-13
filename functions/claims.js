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
  if (!context.auth.token.admin) {
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

  // perform the add or remove of claims based on data
  // TODO: promise / return / error management
  return Promise.all(data.users.map(async (uid) => {
    const user = await admin.auth().getUser(uid);
    const customClaims = user.customClaims || {}; // preserve existing claims
    data.claims.forEach((claim) => {
      if (data.action === "add") {
        customClaims[claim] = true; // add the claim to existing claims
      } else if (data.action === "remove") {
        if (customClaims[claim] === true) {
          delete customClaims[claim]; // remove the claim from existing claims
        }
      }
    });
    await admin.auth().setCustomUserClaims(uid, customClaims);

    // update the corresponding Profiles document
    // must use update rather than set with merge:true because
    // otherwise removal of claims will not be reflected
    // https://stackoverflow.com/questions/46597327/difference-between-set-with-merge-true-and-update
    // TODO: create profile if it doesn't exist?
    const profile = db.collection("Profiles").doc(uid);
    return profile.update({ customClaims });
  }))
}

// Dump all claims from firebase auth() users to corresponding profiles
exports.claimsToProfiles = async (data, context, db) => {
  // Pre-conditions, caller must be authenticated admin role-holder
  if (!context.auth) {
    // Throw an HttpsError so that the client gets the error details
    throw new functions.https.HttpsError("unauthenticated",
      "Caller must be authenticated");
  }
  if (!context.auth.token.admin) {
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
    await Promise.all(
      listUsersResult.users.map((user) => {
        const profile = db.collection("Profiles").doc(user.uid);
        if (user.customClaims) {
          // the auth() user has custom claims
          return profile.get()
            .then((snap) => {
              if (snap.exists) {
                return batch.update(profile, { customClaims: user.customClaims });
              } else {
                return batch.set(profile, {...user});
              }
            })
            .catch(error => Promise.reject(error));
        }
        else {
          // the auth() user has no custom claims
          return Promise.resolve();
        }
      })
    );
    try {
      batch.commit();
    } catch (error) {
      throw new functions.https.HttpsError("internal", "failed to commit custom Claims to Profiles");
    }
    if (listUsersResult.pageToken) {
      iterateAllUsers(listUsersResult.pageToken); // get next batch of users
    }
  }

  // TODO: this return value needs to be populated with errors, success etc.
  return iterateAllUsers();
}