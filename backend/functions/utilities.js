const functions = require('firebase-functions');

// make a string with serial & manufacturer that uniquely identifies a computer
exports.makeSlug = function (serial, mfg) {
  const sc = serial.replace(/\s|\/|,/g,"");
  const mc = mfg.toLowerCase().replace(/\/|\.|,|inc|ltd/gi,"").trim().replace(/ /g,"_")
  if (sc.length>=4 && mc.length>=2 ) {
    return sc + ',' + mc;
  } else {
    throw new Error(`serial ${sc} or manufacturer ${mc} too short`);
  }
}

// test necessary preconditions to proceed with the body of a callable such
// as auth state, custom claims, and whether the data matches the schema
// context: the callable context
// claims: an array of custom claims that are authorized for this callable
// validate: ajv validation function
// data: the data object to validate
exports.callableIsAuthorized = function(context, claims, validate, data) {
  // caller must be authenticated
  if (!context.auth) {
    // Throw an HttpsError so that the client gets the error details
    throw new functions.https.HttpsError("unauthenticated",
      "Caller must be authenticated");
  }

  // caller must have at least one authorized custom claim
  if(!claims.some(claim => 
    context.auth.token.hasOwnProperty(claim) && 
    context.auth.token[claim] === true )) {
    // Throw an HttpsError so that the client gets the error details
    throw new functions.https.HttpsError("permission-denied",
      "Caller must have admin role");
  }

  // the shape of data must match the schema
  const valid = validate(data);
  if (!valid) {
    throw new functions.https.HttpsError("invalid-argument",
      "The provided data failed validation");
  }

  return true;
}