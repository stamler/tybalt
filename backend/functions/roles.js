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