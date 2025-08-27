import { makeSlug } from "./utilities";
import * as schema from "./RawLogins.schema.json";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import * as _ from "lodash";
import * as Ajv from "ajv";

const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;
const ajv = new Ajv({
  removeAdditional: true,
  coerceTypes: true,
  allErrors: true, // required for 'removeIfFails' keyword
});

// The 'removeIfFails' keyword deletes a property if it is invalid. Created to
// remove email properties that don't validate, i.e. empty strings.
// See https://github.com/epoberezkin/ajv/issues/300
// Uses inline validator since aggregated errors cannot be accessed otherwise
// https://github.com/epoberezkin/ajv/issues/208#issuecomment-225445407

ajv.addKeyword("removeIfFails", {
  inline: function (it, keyword) {
    // verify that removeIfFails is set to 'true';
    if (it.schema.removeIfFails === true) {
      // TODO replace errs_ and errs__ with errors and vErrors and
      // find the error(s) that match the current schema item
      return `if (errors > 0) {
        // only keep errors whose dataPaths don't match this dataPath
        vErrors = vErrors.filter(
          e => e.dataPath !== ('.' + ${it.dataPathArr[it.dataLevel]}));
        errors = vErrors.length;

        // delete the failing element
        delete data${it.dataLevel - 1 || ""}[${it.dataPathArr[it.dataLevel]}];
      }`;
    }
    return "";
    // TODO: test validation-time code and branching
  },
  metaSchema: { type: "boolean" },
  statements: true, // allow side-effects and modification
  valid: true,
  modifying: true,
});

const validate = ajv.compile(schema);

interface User {
  upn: string;
  givenName: string;
  surname: string;
  lastComputer: string;
  userSourceAnchor: string;
  created?: admin.firestore.Timestamp;
  updated?: admin.firestore.Timestamp | admin.firestore.FieldValue;
  email?: string;
}

interface ValidLogin {
  serial: string;
  upn: string;
  networkConfig: { [key: string]: any };
  userSourceAnchor: string;
  radiatorVersion: number;
  mfg: string;
  userSurname: string;
  userGivenName: string;
  
  bootDriveFS?: string;
  computerName?: string;
  model?: string;
  systemType?: number;
  osSku?: number;
  bootDriveFree?: number;
  osArch?: string;
  bootDrive?: string;
  osVersion?: string;
  email?: string;
  ram?: number;
  bootDriveCap?: number;
}

// User-defined Type Guard
// https://www.typescriptlang.org/docs/handbook/advanced-types.html#user-defined-type-guards
function isValidLogin(data: any): data is ValidLogin {
  // TODO: CUSTOM processing should be done here such as:
  /* 
    if (mfg === 'Red Hat' && model === 'KVM') {
      set serial to dnsHostname
    }
    const valid = validate(d);
  */

  // validate function can return a promise if validate.$async is true
  const result = validate(data);
  if (typeof result === "boolean") {
    return result;
  }
  return false;
}

// Get a raw login and update Computers, Logins, and Users. If it's somehow
// incorrect, write it to RawLogins collection for later processing
export const rawLogins = functions.https.onRequest(async (req: functions.https.Request, res: functions.Response<any>): Promise<any> => {
  const db = admin.firestore();
  // Validate the secret sent in the header from the client.
  const appSecret = functions.config().tybalt.radiator.secret;
  if (appSecret !== undefined) {
    const authHeader = req.get("Authorization");

    let reqSecret = null;
    if (authHeader !== undefined) {
      reqSecret = authHeader.replace("TYBALT ", "").trim();
    }
    if (reqSecret !== appSecret) {
      return res.status(401).send(
        "request secret doesn't match expected"
      );
    }
  }

  // req.body can be used directly as JSON if this passes
  if (req.get("Content-Type") !== "application/json") {
    return res.status(415).send();
  }

  if (req.method !== "POST") {
    res.header("Allow", "POST");
    return res.status(405).send();
  }

  const d = req.body;

  try {
    if (!isValidLogin(d)) {
      if (_.isEmpty(d)) {
        return res.status(400).send("empty submission, not saving");
      } else {
        // write a rawlogin with submitted data and include the error field
        await db.collection("RawLogins").doc().set({...d, error: validate.errors });
      }
    } else {
      // write valid object to database
      await storeValidLogin(d);
    }
    return res.status(202).send();
  } catch (error: unknown) {
    const typedError = error as Error;
    return res.status(500).send(typedError.message);
  }
});

// Creates or updates Computers and Users document, creates Logins document
async function storeValidLogin(d: ValidLogin) {
  const db = admin.firestore()
  const slug = makeSlug(d.serial, d.mfg); // key for Computers collection
  const computerRef = db.collection("Computers").doc(slug);
  let userRef;
  try {
    // try to match existing user, otherwise make a new one. If database
    // inconsistencies are found (i.e. multiple matches) store RawLogin
    userRef = await getUserRef(d);
  } catch (error: unknown) {
    const typedError = error as Error;
    return db.collection("RawLogins").doc().set({...d, error: typedError.message});
  }

  // TODO: delete all RawLogins where the serial matches this one since
  // we are getting a real login now, making them redundant

  // Start a write batch
  const batch = db.batch();

  batch.set(computerRef, {...d, updated: serverTimestamp() }, {
    merge: true,
  });

  const userObject: User = {
    upn: d.upn.toLowerCase(),
    givenName: d.userGivenName,
    surname: d.userSurname,
    lastComputer: slug,
    updated: serverTimestamp(),
    userSourceAnchor: d.userSourceAnchor.toLowerCase(),
  };

  // Confirm optional email prop exists before calling .toLowerCase()
  if (d.email) {
    userObject.email = d.email.toLowerCase();
  }
  // TODO: Check if User has azureObjectID. If it doesn't,
  // try to match it with auth() users by upn/email (Soft match) and then
  // write the key to azureObjectID property
  batch.set(userRef, userObject, {
    merge: true,
  });

  // Create new Login document
  const loginObject = {
    userSourceAnchor: d.userSourceAnchor.toLowerCase(),
    givenName: d.userGivenName,
    surname: d.userSurname,
    computer: slug,
  };
  batch.set(db.collection("Logins").doc(), loginObject);

  // Commit the batch which returns an array of WriteResults
  return batch.commit();
}

async function getUserRef(d: ValidLogin) {
  // If a user was deleted from the directory then recreated then the user
  // will be represented twice in the database. This state of multiple user
  // entries who are in fact one user is beyond the scope of this function.
  
  const db = admin.firestore()
  const usersRef = db.collection("Users");

  const result = await usersRef.where("userSourceAnchor", "==", d.userSourceAnchor).get();

  // throw if >1 result is returned, caller will set RawLogin
  if (result.size > 1) {
    throw new Error(`Multiple users have userSourceAnchor: ${d.userSourceAnchor}`);
  }

  // if exactly one result is returned, return its DocumentReference
  if (result.size === 1) {
    return result.docs[0].ref;
  }

  // if zero results are returned, return a ref to a new document
  return db.collection("Users").doc();
}

// Cleanup old RawLogins onCreate
// This function deletes all rawLogins except for the latest
// for each computerName. The deletion will be done on a batched
// write after querying what we want
// https://github.com/googleapis/nodejs-firestore/issues/64
export const rawLoginsCleanup = functions.firestore
  .document("RawLogins/{loginId}")
  .onCreate(async (
    snapshot: admin.firestore.DocumentSnapshot, 
    context: functions.EventContext
  ) =>{
    const data = snapshot.data();
    const db = admin.firestore();

    if (data === undefined) {
      throw new Error("cleanup() failed because the DocumentSnapshot is undefined");
    }

    functions.logger.info(`cleanup ${data.computerName}`);
    // Get the latest rawLogin with specified computerName
    const latest_item_snapshot = await db
      .collection("RawLogins")
      .where("computerName", "==", data.computerName)
      .orderBy("created", "desc")
      .limit(1)
      .get();

    if (latest_item_snapshot.empty) {
      throw new functions.https.HttpsError(
        "not-found",
        "The provided computerName doesn't exist"
      );
    }

    // Get previous rawLogin with specified computerName for deletion
    const old_items_snapshot = await db
      .collection("RawLogins")
      .where("computerName", "==", data.computerName)
      .where("created", "<", latest_item_snapshot.docs[0].data().created)
      .orderBy("created", "desc")
      .get();

    if (old_items_snapshot.size > 0) {
    // Do the deletion here
      const batch = db.batch();
      old_items_snapshot.forEach((element) => {
        batch.delete(element.ref);
      });
      try {
        await batch.commit();
        return `Deleted ${old_items_snapshot.size} entries of ${
          data.computerName
        } prior to ${latest_item_snapshot.docs[0].data().created.toDate()}`;
      } catch (error: unknown) {
        const typedError = error as Error;
        return typedError.message;
      }
    } else {
      return `No items to cleanup for computerName ${data.computerName}`;
    }
  });
