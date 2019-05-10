/* 

This module exports callable handlers (functions.https.onCall(<handler_func>))
https://firebase.google.com/docs/functions/callable


*/

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// JSON schema validation
const Ajv = require('ajv')
const schema = require('./AssignComputer.schema.json')
const ajv = new Ajv()
const validate = ajv.compile(schema);

// The claimsHandler writes user information under the assigned property of a 
// computer based on a userSourceAnchor and Computer ID
exports.assignComputerToUser = async (data, context, db) => {
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
  
  // Get the user docRef
  let snapshot = await db.collection("Users").where("userSourceAnchor", "==", data.user).get();
  
  if (snapshot.empty) {
    throw new functions.https.HttpsError("not-found",
    "The provided userSourceAnchor doesn't exist");
  }
  
  if (shapshot.size > 1) {
    throw new functions.https.HttpsError("internal",
    `Something is broken; ${snapshot.size} users have userSourceAnchor ${data.user}`);
  }
  
  const user = snapshot.docs[0];
  
  // write the assignment
  const computer = db.collection("Computers").doc(data.computer);
  return computer.update({assigned: {
    userSourceAnchor: data.user,
    time: admin.firestore.FieldValue.serverTimestamp(),
    upn: user.upn,
    givenName: user.givenName,
    surname: user.surname
  }});
};