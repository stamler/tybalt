import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// make a string with serial & manufacturer that uniquely identifies a computer
export function makeSlug(serial: string, mfg: string) {
  const sc = serial.replace(/\s|\/|,/g, "");
  const mc = mfg
    .toLowerCase()
    .replace(/\/|\.|,|inc|ltd/gi, "")
    .trim()
    .replace(/ /g, "_");
  if (sc.length >= 4 && mc.length >= 2) {
    return sc + "," + mc;
  } else {
    throw new Error(`serial ${sc} or manufacturer ${mc} too short`);
  }
};

// throw if at least one authorizedClaim isn't present in the context
export function getAuthObject(context: functions.https.CallableContext, authorizedClaims: string[]): {uid: string, token: admin.auth.DecodedIdToken} {
  if (!context.auth) {
    // Throw an HttpsError so that the client gets the error details
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Caller must be authenticated"
    );
  }
  const auth = context.auth;

  // caller must have at least one authorized custom claim
  if (
    !authorizedClaims.some(
      (claim: string) =>
        Object.prototype.hasOwnProperty.call(auth.token, claim) &&
        auth.token[claim] === true
    )
  ) {
    // Throw an HttpsError so that the client gets the error details
    throw new functions.https.HttpsError(
      "permission-denied",
      `Caller must have one of [${authorizedClaims.toString()}] claims`
    );
  }
  return auth;
}