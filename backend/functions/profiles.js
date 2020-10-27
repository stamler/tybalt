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
      managerUid: null    
    });
  } catch (error) {
    console.log(error);
    return null;
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

// update the Firebase Auth User that corresponds to the Profile
// can be displayed in the UI
// VERIFY THIS WORKS WITH FEDERATED USERS (MICROSOFT IN THIS CASE)
exports.updateAuth = async (change, context) => {
  if (change.after.exists) {
    const before = change.before.data();
    const after = change.after.data();
    const promises = [];
    try {
      const user = await admin.auth().getUser(change.after.id);
    } catch (error) {
      console.log(`Error fetching user ${change.after.id}.`, error.message);
    }
    if (!_.isEqual(before.customClaims, after.customClaims)) {
      // customClaims were changed, update them
      // TODO: !!Validate that the customClaims format is correct!!
      promises.push(admin.auth().setCustomUserClaims(change.after.id, after.customClaims));
    }
    if (before.email !== after.email || 
        before.displayName !== after.displayName) {
      promises.push(admin.auth().updateUser(
        change.after.id,
        {
          displayName: after.displayName,
          email: after.email
        }
        )
      );
    }
    // if the managerUid changes, get the correct managerName for it
    if (before.managerUid !== after.managerUid) {
      const managerProfile = await admin.firestore().collection("Profiles").doc(after.managerUid).get();
      if (managerProfile.exists) {
        promises.push(change.after.ref.set({managerName: managerProfile.get("displayName")}, { merge: true }));
      } else {
        throw new Error(`managerUid ${after.managerUid} is not a valid Profile identifier`);
      }
    }
    return Promise.all(promises);
  } else {
    console.log("A Profile document was deleted. If a corresponding user" +
      " remains in Firebase Auth, recreate it manually");
    return null;
  }
}