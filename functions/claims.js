/* 

This module exports callable handlers (functions.https.onCall(<handler_func>))
https://firebase.google.com/docs/functions/callable

// The claimsHandler adds or removes claims to one or more firebase auth() users
claimsHandler(data, context) {
    const
}

*/

const admin = require('firebase-admin');
const db = admin.firestore();
admin.firestore().settings({timestampsInSnapshots: true});

// Dump all claims from firebase auth() users to corresponding profiles
exports.claimsToProfiles = async (data, context) => {
  async function iterateAllUsers(nextPageToken) {
    listUsersResult = await admin.auth().listUsers(1000, nextPageToken);
    
    const batch = db.batch();
    listUsersResult.users.forEach((user) => {
      // Add this user's profile update to the batch
      const profile = db.collection("Profiles").doc(user.uid);
      batch.set(profile, { roles: user.customClaims },{merge: true});
    });
    try {
      await batch.commit();
    } catch (error) {
      console.log(error);
    }
    if (listUsersResult.pageToken) {      
      iterateAllUsers(listUsersResult.pageToken); // get next batch of users
    }
  }
  return iterateAllUsers();
}