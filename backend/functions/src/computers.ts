/* 

This module exports callable handlers (functions.https.onCall(<handler_func>))
https://firebase.google.com/docs/functions/callable

*/
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { getAuthObject } from "./utilities";

interface ComputerAssignment {
  computerId: string; 
  userSourceAnchor: string;
}

// User-defined Type Guard
// https://www.typescriptlang.org/docs/handbook/advanced-types.html#user-defined-type-guards
function isComputerAssignment(data: any): data is ComputerAssignment {
  if (data.computerId && data.userSourceAnchor) {
    return (
      typeof data.computerId === "string" && 
      typeof data.userSourceAnchor === "string"
    );
  }
  return false;
}

// The claimsHandler writes user information under the assigned property of a
// computer based on a userSourceAnchor and Computer ID
// TODO: possibly do this in the client with a transaction by opening up
// appropriate permissions in firestore security rules
export async function assignComputerToUser(
    data: unknown, 
    context: functions.https.CallableContext
  ) {
    const db = admin.firestore();

    // throw if the caller isn't authenticated & authorized
    const auth = getAuthObject(context,["computers"]);

    // Validate the data or throw
    // use a User Defined Type Guard
    let assignment: ComputerAssignment;
    if (isComputerAssignment(data)) {
      assignment = data;
    } else {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "The provided data isn't a valid computer assignment"
      );
    }

    // Get the user docRef
    const snapshot = await db
      .collection("Users")
      .where("userSourceAnchor", "==", assignment.userSourceAnchor)
      .get();

    if (snapshot.empty) {
      throw new functions.https.HttpsError(
        "not-found",
        "The provided userSourceAnchor doesn't exist"
      );
    }

    if (snapshot.size > 1) {
      throw new functions.https.HttpsError(
        "internal",
        `Something is broken; ${snapshot.size} users have userSourceAnchor ${assignment.userSourceAnchor}`
      );
    }

    const user = snapshot.docs[0].data();

    // write the assignment
    const computer = db.collection("Computers").doc(assignment.computerId);

    return computer.update({
      "assigned.userSourceAnchor": assignment.userSourceAnchor,
      "assigned.time": admin.firestore.FieldValue.serverTimestamp(),
      "assigned.upn": user.upn,
      "assigned.givenName": user.givenName,
      "assigned.surname": user.surname,
      "assigned.by": auth.uid,
      "assigned.byName": auth.token.name,
    });
  };
