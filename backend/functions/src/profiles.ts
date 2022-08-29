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
//import { subDays } from "date-fns";
import { getAuthObject, isPayrollWeek2 } from "./utilities";
import algoliasearch from "algoliasearch";
const env = functions.config();

interface MSJwtPayload extends JwtPayload {
  oid: string;
}

interface AccessTokenPayload {
  accessToken: string;
}

interface OpeningValuesPayload {
  // integer result of openingDateTimeOff.toDate().getTime()
  openingDateTimeOff: number;
  openingOV: number;
  openingOP: number;
  uid: string;
}

function isOpeningValuesPayload(data: any): data is OpeningValuesPayload {
  
  // validate that the openingDateTimeOff is a number
  if (!(
      data.openingDateTimeOff !== undefined && 
      typeof data.openingDateTimeOff === "number"
    )) {
    return false;
  }

  // validate that openingOV is a number
  if (!(
    data.openingOV !== undefined &&
    typeof data.openingOV === "number" 
  )) {
    return false;
  }

  // validate that openingOP has is multiple of 0.5 and no more than 332
  if (!(
    data.openingOP !== undefined &&
    typeof data.openingOP === "number"
  )) {
    return false;
  }

  // validate uid is a string
  if (!(data.uid !== undefined && typeof data.uid === "string")) {
    return false;
  }

  return true;
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
  const db = admin.firestore();
  if (change.after.exists) {
    const before = change.before.data();
    const after = change.after.data();
    const promises = [];
    // TODO: handle before.customClaims or after.customClaims when undefined
    if (!_.isEqual(before.customClaims, after.customClaims)) {
      // customClaims were changed, update them
      // Validate the customClaims format with the type guard
      let newClaims;
      try {
        newClaims = after.customClaims
      } catch (error) {
        functions.logger.error(`newClaims error: ${error}`);
      }
      if (!isCustomClaims(newClaims)) {
        throw new Error(
          `The provided data isn't a valid custom claims object`
        );
      }
      promises.push(
        admin.auth().setCustomUserClaims(change.after.id, newClaims)
      );

      // update ManagerNames collection
      if (after.customClaims.tapr === true) {
        await db.collection("ManagerNames").doc(change.after.id).set({
          displayName: after.displayName,
          surname: after.surname,
          givenName: after.givenName,
        });
      } else {
        await db.collection("ManagerNames").doc(change.after.id).delete();
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
    await db.collection("ManagerNames").doc(change.before.id).delete();
    await db.collection("ProfileSecrets").doc(change.before.id).delete();
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
  const query = "$select=givenName,surname,onPremisesImmutableId,id,jobTitle,mobilePhone,displayName,mail"
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
      displayName: response.data.displayName,
      email: response.data.mail,
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
/*
  // if algoliaSearchKeyUpdated is after the date 14 days ago, 
  // return and do nothing. This prevents an infinite loop.
  const algoliaSearchKeyUpdated = change.after.get("algoliaSearchKeyUpdated")
  if (algoliaSearchKeyUpdated !== undefined && algoliaSearchKeyUpdated.toDate() > subDays(new Date(), 14)) {
    functions.logger.log(`profile ${change.after.id} received a key update less than 14 days ago, aborting.`);
    return;
  } 
*/
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
  const restrictIndices = Object.values(_.pick(claimIndexMap,Object.keys(customClaims)));

  // Generate a secured api key using the search-only API key secret stored in functions.config().algolia.searchkey
  // specify userToken to match the profile id (which in turn matches the firebase auth uid)
  // specify restrictIndices here based on indices calculated from claims above 
  // https://www.algolia.com/doc/api-reference/api-methods/generate-secured-api-key/
  const key = client.generateSecuredApiKey(env.algolia.searchkey, {
    userToken: change.after.id,
    restrictIndices: [...new Set(restrictIndices)],
  });

  functions.logger.info(`generated algolia key for profile ${change.after.id}`);

  // save the key to the ProfileSecrets doc
  return db.collection("ProfileSecrets").doc(change.after.id).set({
    algoliaSearchKey: key,
    algoliaSearchKeyUpdated: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
});

// This function validates that the caller has permission then receives and
// checks new opening values for time off (PPTO and VAC) and the corresponding
// opening date. Once the data is validated the Profile is updated.
export const updateOpeningValues = functions.https.onCall((data: unknown, context: functions.https.CallableContext) => {
  // throw if the caller isn't authenticated & authorized
  getAuthObject(context,["ovals"]);

  const db = admin.firestore();

  if (!isOpeningValuesPayload(data)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The opening values payload didn't validate"
    );
  }

  if (!(
    isPayrollWeek2(new Date(data.openingDateTimeOff))
  )) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The date provided is not the end of a pay period"
    );
  }

  if (!(
    Math.floor(data.openingOV) === data.openingOV ||
    data.openingOV.toString().split(".")[1].length < 3
  )) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The opening OV value cannot have more than 2 decimal places"
    );
  }

  if ( data.openingOV > 200 || data.openingOV < 0 ) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The opening OV cannot be negative or greater than 200"
    );
  }

  if (!(
    Math.floor(data.openingOP * 2) === data.openingOP * 2
  )) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The opening OP must be a multiple of 0.5"
    );
  }

  if ( data.openingOP > 332 || data.openingOP < 0 ) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The opening OP cannot negative or greater than 332"
    );
  }  

  return db.collection("Profiles").doc(data.uid).update({
    openingDateTimeOff: new Date(data.openingDateTimeOff),
    openingOV: data.openingOV,
    openingOP: data.openingOP,
  });

});

// This function takes a uid as an argument in data { uid: "user_ID" } and
// updates the usedOV and usedOP numbers on the profile by enumerating all of
// that user's timesheets that are later than the profile's openingDateTimeOff
// value and summing the values of the OV and OP properties of each
// nonWorkHoursTally property of each TimeSheets document. It also gets all of
// the user's mileage expenses after the app_wide "openingMileageDate" variable
// and sums the mileage then stores it in the profile.
export async function updateProfileTallies(uid: string) {
  const db = admin.firestore();

  // Load the profile for the user to get opening values and later
  // use it to write back the used values
  const profile = await db.collection("Profiles").doc(uid).get();
  if (!profile.exists) {
    throw new Error(`Profile ${uid} does not exist`);
  }
  const openingDate = profile.get("openingDateTimeOff");
  const openingOV = profile.get("openingOV");
  const openingOP = profile.get("openingOP");

  if (
    openingDate === undefined ||
    openingOV === undefined ||
    openingOP === undefined
    ) {
    throw new Error(`Profile ${uid} is missing one of openingDateTimeOff, openingOV, or openingOP`);
  }

  const querySnapTimeSheets = await db.collection("TimeSheets")
    .where("uid", "==", uid)
    .where("locked", "==", true)
    .where("weekEnding", ">", openingDate)
    .orderBy("weekEnding","desc") // sorted descending so latest element first
    .get();

  // Iterate over the timesheets and come up with a total
  let usedOV = 0;
  let usedOP = 0;

  try {
    querySnapTimeSheets.docs.map((tsSnap) => {
      const nonWorkHoursTally = tsSnap.get("nonWorkHoursTally");
      usedOV += nonWorkHoursTally.OV || 0;
      usedOP += nonWorkHoursTally.OP || 0;
    });      
  } catch (error) {
    functions.logger.error(`Error tallying nonWorkHoursTally for ${uid}`);
    throw error;
  }
  
  // iterate over TimeAmendments and add to existing totals
  const querySnapTimeAmendmentsOV = await db.collection("TimeAmendments")
    .where("uid", "==", uid)
    .where("committed", "==", true)
    .where("committedWeekEnding", ">", openingDate)
    .where("timetype","==","OV")
    .get();
    
    try {
      querySnapTimeAmendmentsOV.docs.map((amendSnap) => {
        usedOV += amendSnap.get("hours");
      });
    } catch (error) {
      functions.logger.error(`Error tallying TimeAmendments OV for ${uid}`);
      throw error;
    }

    const querySnapTimeAmendmentsOP = await db.collection("TimeAmendments")
    .where("uid", "==", uid)
    .where("committed", "==", true)
    .where("committedWeekEnding", ">", openingDate)
    .where("timetype","==","OP")
    .get();

    try {
      querySnapTimeAmendmentsOP.docs.map((amendSnap) => {
        usedOP += amendSnap.get("hours");
      });        
    } catch (error) {
      functions.logger.error(`Error tallying TimeAmendments OP for ${uid}`);
      throw error;
    }
  
  // Load the AnnualDates document in the Config collection to get the
  // openingMileage date
  const annualDates = await db.collection("Config").doc("AnnualDates").get();
  if (!annualDates.exists) {
    throw new Error(`AnnualDates document does not exist`);
  }

  const mileageClaimedSince = annualDates.get("openingMileageDate");
  if (mileageClaimedSince === undefined) {
    throw new Error(`AnnualDates document is missing openingMileageDate`);
  }

  // Load mileage expenses for the user after mileageClaimedSince
  const querySnapMileageExpenses = await db.collection("Expenses")
    .where("uid", "==", uid)
    .where("committed", "==", true)
    .where("payPeriodEnding", ">", mileageClaimedSince)
    .where("paymentType", "==", "Mileage")
    .orderBy("payPeriodEnding","desc") // sorted descending so latest element first
    .get();

  // Total mileage is the sum of all distance entries in every returned document
  let mileageClaimed = 0;
  if(querySnapMileageExpenses.docs.length > 0) {
    functions.logger.info(`${querySnapMileageExpenses.docs.length} mileage expenses found for ${uid} after ${mileageClaimedSince.toDate().toISOString()}`);
    mileageClaimed = querySnapMileageExpenses.docs.reduce((acc, curr) => {
      if (curr.get("distance") === undefined) {
        throw new Error(`Expense ${curr.id} is missing distance property`);
      }
      if (typeof curr.get("distance") !== "number") {
        throw new Error(`Expense ${curr.id} distance property is not a number`);
      }
      return acc + curr.get("distance");
    }, 0);
  }

  // Commit the output to the profile for time off tallies and mileage total
  // the first TimeSheets doc in the query is the latest so will have
  // the latest weekEnding for reporting effective date to the user
  const usedAsOf = querySnapTimeSheets.docs[0].get("weekEnding");
  return profile.ref.update({ usedOV, usedOP, usedAsOf, mileageClaimed, mileageClaimedSince });
};
