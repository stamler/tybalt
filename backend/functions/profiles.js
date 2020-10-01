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

const admin = require('firebase-admin');
const _ = require('lodash');

// Create the corresponding Profile document when an auth user is deleted
exports.createProfile = async(user, db) => {
  const customClaims = {
    time: true
  };
  await admin.auth().setCustomUserClaims(user.uid, customClaims)

  try {
    return db.collection("Profiles").doc(user.uid).set({
      displayName: user.displayName,
      email: user.email,
      customClaims,
      manager_uid: null    
    });
  } catch (error) {
    console.log(error);
  }
}

// Delete the corresponding Profile document when an auth user is deleted
exports.deleteProfile = async(user, db) => {
  try {
    await db.collection("Profiles").doc(user.uid).delete();
  } catch (error) {
    console.log(error);
  }
}

// update the Firebase Auth Custom Claims from the corresponding Profile doc
exports.updateClaims = async (change, context) => {
  if (change.after.exists) {
    if (_.isEqual(change.before.customClaims, change.after.customClaims)) {
      // The Firebase Auth User Record customClaims weren't changed
      return null;
    } else {
      // The Firebase Auth User Record customClaims were changed, update them
      // TODO: !!Validate that the customClaims format is correct!!
      return admin.auth().setCustomUserClaims(uid, change.after.customClaims);
    }
  } else {
    console.log("A Profile document was deleted. If a corresponding user" +
      " remains in Firebase Auth, recreate it manually");
    return null;
  }
}