// presence.ts
// support check-ins, whether a user is on vacation, their availability
// calendar, etc.

import * as functions from "firebase-functions/v1";
import { getAuthObject, isLocationStringObject, isVacationObject } from "./utilities";
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

  // Get the user's profile from the Profiles collection
  const profile = await db.collection("Profiles").doc(auth.uid).get();

  // create a batch to write to both the CheckIns and Profiles collections
  const batch = db.batch();

  batch.create(db.collection("CheckIns").doc(), {
    uid: auth.uid, 
    time: admin.firestore.FieldValue.serverTimestamp(),
    location: data.location,
    displayName: profile.get("displayName"),
  });

  batch.update(db.collection("Profiles").doc(auth.uid), {
    location: data.location,
    location_time: admin.firestore.FieldValue.serverTimestamp(),
  });

  return batch.commit();
});

// This is a callable function that will create a vacation schedule for a user.
// Deletion will be handled by firestore rules. Editing will not be supported.
// The function receives a data object with a start and end property, both of
// which are dates. The function will create a new document in the Vacations
// collection with the uid, start, and end properties. The corresponding
// document in the Profiles collection will read to store the display name in
// the new document as well.
export const createVacation = functions.https.onCall(async (data: unknown, context: functions.https.CallableContext) => {
  const auth = getAuthObject(context, ["time"]);
  const db = admin.firestore();

  // verify the data object contains only a string in its location property
  // using the appropriate type guard
  if (!isVacationObject(data)) {
    throw new functions.https.HttpsError("invalid-argument", "The function must be called with " +
      "a start and end number that represent msecs since the epoch.");
  }

  // If the end date is before the start date, throw an error
  if (data.end <= data.start) {
    throw new functions.https.HttpsError("invalid-argument", "The end date must be after the start date.");
  }

  // Get the user's profile from the Profiles collection
  const profile = await db.collection("Profiles").doc(auth.uid).get();

  // create a batch to write to both the Vacations and Profiles collections
  const batch = db.batch();

  batch.create(db.collection("Vacations").doc(), {
    uid: auth.uid, 
    displayName: profile.get("displayName"),
    start: new Date(data.start),
    end: new Date(data.end),
    description: data.description,
    availability: data.availability,
  });

  return batch.commit();
});
