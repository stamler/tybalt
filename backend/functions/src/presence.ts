// presence.ts
// support check-ins, whether a user is on vacation, their availability
// calendar, etc.

import * as functions from "firebase-functions";
import { getAuthObject, isLocationStringObject } from "./utilities";
import * as admin from "firebase-admin";


// This is a callable function that will be called from the client to check in.
// It receives only a string in the payload. The uid is read from the auth
// information and the timestamp is generated on the server. A new document is
// created in the CheckIns collection with the uid, time, and location. Finally,
// the corresponding document in the Profiles collection is updated with the new
// location and time.
export const checkIn = functions.https.onCall(async (data: unknown, context: functions.https.CallableContext) => {
  const auth = getAuthObject(context, ["time"]);
  const db = admin.firestore();

  // verify the data object contains only a string in its location property
  // using the appropriate type guard
  if (!isLocationStringObject(data)) {
    throw new functions.https.HttpsError("invalid-argument", "The function must be called with " +
      "a string in the location property.");
  }

  // create a batch to write to both the CheckIns and Profiles collections
  const batch = db.batch();

  batch.create(db.collection("CheckIns").doc(), {
    uid: auth.uid, 
    time: admin.firestore.FieldValue.serverTimestamp(),
    location: data.location,
  });

  batch.update(db.collection("Profiles").doc(auth.uid), {
    location: data.location,
    location_time: admin.firestore.FieldValue.serverTimestamp(),
  });

  return batch.commit();
});