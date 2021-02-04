// TODO:

// Function to write customClaims to users for RBAC (chclaim)
// Function to dump users including claims info to Cloud Firestore Profiles (userdump)
//   This creates Profiles documents for every user if they don't exist
// Function to update multiple user's claims (runs userdump after)
// Function to batch-upload users
// Function to iterate over list of uids and add the same customClaims to each
//
// the firebase Users collection document for this user.
// https://firebase.google.com/docs/auth/admin/custom-claims
//  Callable functions to automatically get context:
//      https://firebase.google.com/docs/functions/callable

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import * as _ from "lodash";

interface CustomClaims { // Record type instead?
  [claim: string]: boolean;
}

// User-defined Type Guard
function isCustomClaims(data: any): data is CustomClaims {
  for (const key in data) {
    if (typeof key !== "string" || typeof data[key] !== "boolean") {
      return false
    }
  }
  return true;
}

// Create the corresponding Profile document when an auth user is created
// Use merge in case the document already exists.
export async function createProfile(user: admin.auth.UserRecord) {
  const db = admin.firestore();
  const customClaims = { time: true };
  await admin.auth().setCustomUserClaims(user.uid, customClaims);

  try {
    return db.collection("Profiles").doc(user.uid).set({
      displayName: user.displayName,
      email: user.email,
      customClaims,
      managerUid: null,
    }, { merge: true });
  } catch (error) {
    console.log(error);
    return null;
  }
};

// Delete the corresponding Profile document when an auth user is deleted
export async function deleteProfile(user: admin.auth.UserRecord) {
  const db = admin.firestore();
  try {
    await db.collection("Profiles").doc(user.uid).delete();
  } catch (error) {
    console.log(error);
  }
};

// update the Firebase Auth User that corresponds to the Profile
// can be displayed in the UI
// TODO: rename this function because it also updates managerName in Profile
// VERIFY THIS WORKS WITH FEDERATED USERS (MICROSOFT IN THIS CASE)
export async function updateAuth(change: functions.ChangeJson, context: functions.EventContext) {
  if (change.after.exists) {
    const before = change.before.data();
    const after = change.after.data();
    const promises = [];
    // TODO: handle before.customClaims or after.customClaims when undefined
    if (!_.isEqual(before.customClaims, after.customClaims)) {
      // customClaims were changed, update them
      // Validate the customClaims format with the type guard
      const newClaims = after.customClaims
      if (isCustomClaims(newClaims)) {
        promises.push(
          admin.auth().setCustomUserClaims(change.after.id, newClaims)
        );            
      } else {
        throw new Error(
          `The provided data isn't a valid custom claims object`
        );
      }
    }
    if (
      before.email !== after.email ||
      before.displayName !== after.displayName
    ) {
      promises.push(
        admin.auth().updateUser(change.after.id, {
          displayName: after.displayName,
          email: after.email,
        })
      );
    }
    // if the managerUid changes, get the correct managerName for it
    if (before.managerUid !== after.managerUid) {
      const managerProfile = await admin
        .firestore()
        .collection("Profiles")
        .doc(after.managerUid)
        .get();
      if (managerProfile.exists) {
        promises.push(
          change.after.ref.set(
            { managerName: managerProfile.get("displayName") },
            { merge: true }
          )
        );
      } else {
        throw new Error(
          `managerUid ${after.managerUid} is not a valid Profile identifier`
        );
      }
    }
    return Promise.all(promises);
  } else {
    console.log(
      "A Profile document was deleted. If a corresponding user" +
        " remains in Firebase Auth, recreate it manually"
    );
    return null;
  }
};
