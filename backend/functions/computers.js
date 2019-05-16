/* 

This module exports callable handlers (functions.https.onCall(<handler_func>))
https://firebase.google.com/docs/functions/callable

*/

const admin = require('firebase-admin');
const functions = require('firebase-functions');
const callableIsAuthorized = require('./utilities.js').callableIsAuthorized;

// JSON schema validation
const Ajv = require('ajv')
const schema = require('./AssignComputer.schema.json')
const ajv = new Ajv()
const validate = ajv.compile(schema);

// The claimsHandler writes user information under the assigned property of a 
// computer based on a userSourceAnchor and Computer ID
exports.assignComputerToUser = async (data, context, db) => {
  callableIsAuthorized(context, ['computers'], validate, data);
  
  // Get the user docRef
  let snapshot = await db.collection("Users").where("userSourceAnchor", "==", data.user).get();
  
  if (snapshot.empty) {
    throw new functions.https.HttpsError("not-found",
    "The provided userSourceAnchor doesn't exist");
  }
  
  if (snapshot.size > 1) {
    throw new functions.https.HttpsError("internal",
    `Something is broken; ${snapshot.size} users have userSourceAnchor ${data.user}`);
  }
  
  const user = snapshot.docs[0].data();
  
  // write the assignment
  const computer = db.collection("Computers").doc(data.computer);

  return computer.update({
    "assigned.userSourceAnchor": data.user,
    "assigned.time": admin.firestore.FieldValue.serverTimestamp(),
    "assigned.upn": user.upn,
    "assigned.givenName": user.givenName,
    "assigned.surname": user.surname,
    "assigned.by": context.auth.uid,
    "assigned.byName": context.auth.token.name,
  });
};