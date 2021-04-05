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
import axios from "axios";
import jwtDecode, { JwtPayload } from "jwt-decode";
import { subDays } from "date-fns";
import algoliasearch from "algoliasearch";
const env = functions.config();

interface MSJwtPayload extends JwtPayload {
  oid: string;
}

interface AccessTokenPayload {
  accessToken: string;
}

// User-defined Type Guard
// https://www.typescriptlang.org/docs/handbook/advanced-types.html#user-defined-type-guards
function isAccessTokenPayload(data: any): data is AccessTokenPayload {
  if (data.accessToken) {
    return typeof data.accessToken === "string";
  }
  return false;
}

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
      tbtePayrollId: null,
      salary: false,
      timeSheetExpected: true,
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

export async function updateProfileFromMSGraph(data: unknown, context: functions.https.CallableContext) {
  const db = admin.firestore();
  if (!context.auth) {
    // Throw an HttpsError so that the client gets the error details
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Caller must be authenticated"
    );
  }

  const auth = context.auth;
  console.log(`Received a call from ${auth.token.uid} to query the MS Graph`);
  

  // Validate the data or throw
  // use a User Defined Type Guard
  if (!isAccessTokenPayload(data)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The provided data isn't a valid access token payload"
    )
  }

  // Get the Azure ID to make specific queries
  const decoded = jwtDecode<MSJwtPayload>(data.accessToken);
  const query = "$select=givenName,surname,onPremisesImmutableId,id,jobTitle,mobilePhone"
  // OAuth access and id tokens can also be retrieved:
  const bearer = "Bearer " + data.accessToken;
  //const idToken = credential.idToken;
  const response = await axios.get(`https://graph.microsoft.com/v1.0/users/${decoded.oid}?${query}`, {
    headers: {
      Authorization: bearer,
      "Content-Type": "application/json",
    },
  })
  
  return db.collection("Profiles").doc(auth.token.uid).set(
    {
      givenName: response.data.givenName,
      surname: response.data.surname,
      azureId: response.data.id,
      userSourceAnchor64: response.data.onPremisesImmutableId,
      userSourceAnchor: Buffer.from(response.data.onPremisesImmutableId, 'base64').toString("hex"),
      jobTitle: response.data.jobTitle,
      mobilePhone: response.data.mobilePhone,
      msGraphDataUpdated: admin.firestore.FieldValue.serverTimestamp(), 
      // TODO: include immutableId, possibly with a query
      // https://stackoverflow.com/questions/48866220/using-microsoft-graph-how-do-i-get-azure-ad-user-fields-that-were-synced-from-on?rq=1
    },
    { merge: true }
  );
}

export const algoliaUpdateSecuredAPIKey = functions.firestore
  .document("Profiles/{profileId}")
  .onWrite(async (change, context) => {

  const db = admin.firestore();
  functions.logger.log(`update of profile ${change.after.id} triggered Secured API Key generation for Algolia search`);


  if (!change.after.exists) {
    functions.logger.log(`profile ${change.after.id} was deleted, aborting.`);
    return;
  }

  // if algoliaSearchKeyUpdated is after the date 14 days ago, 
  // return and do nothing. This prevents an infinite loop.
  const algoliaSearchKeyUpdated = change.after.get("algoliaSearchKeyUpdated")
  if (algoliaSearchKeyUpdated !== undefined && algoliaSearchKeyUpdated.toDate() > subDays(new Date(), 14)) {
    functions.logger.log(`profile ${change.after.id} received a key update less than 14 days ago, aborting.`);
    return;
  } 

  // setup the Algolia client
  const client = algoliasearch(env.algolia.appid, env.algolia.searchkey);

  const claimIndexMap = {
    job: "tybalt_jobs",
    time: "tybalt_jobs",
  }

  const customClaims = change.after.get("customClaims");
  if (customClaims === undefined) {
    functions.logger.error(`profile ${change.after.id} has no customClaims from which to derive restrictIndices`);
    return;
  }
  
  // get the list of unique indices mapped by the profiles customClaims
  const restrictIndices = Object.values(_.pick(claimIndexMap,Object.keys(customClaims))) as string[];

  // Generate a secured api key using the search-only API key secret stored in functions.config().algolia.searchkey
  // specify userToken to match the profile id (which in turn matches the firebase auth uid)
  // specify restrictIndices here based on indices calculated from claims above 
  // https://www.algolia.com/doc/api-reference/api-methods/generate-secured-api-key/
  const key = client.generateSecuredApiKey(env.algolia.searchkey, {
    userToken: change.after.id,
    restrictIndices: [...new Set(restrictIndices)],
  });

  functions.logger.info(`generated algolia key for profile ${change.after.id}`);

  // save the key to the firestore profile
  return db.collection("Profiles").doc(change.after.id).update({
    algoliaSearchKey: key,
    algoliaSearchKeyUpdated: admin.firestore.FieldValue.serverTimestamp(),
  });
});