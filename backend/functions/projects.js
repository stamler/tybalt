/* 

This module exports callable handlers (functions.https.onCall(<handler_func>))
https://firebase.google.com/docs/functions/callable

*/

const callableIsAuthorized = require("./utilities.js").callableIsAuthorized;

// The claimsHandler writes a searchStrings array to one or more provided
// documents containing the tokenized set of words in the provided properties
exports.documentPropertiesToSearchArray = async (data, context, db) => {
  callableIsAuthorized(context, ["projects"], validate, data);
  const project = db.collection("Projects").doc(data.projectId);
  return project.update({});
};
