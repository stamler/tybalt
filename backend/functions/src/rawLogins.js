const serverTimestamp = require("firebase-admin").firestore.FieldValue
  .serverTimestamp;
const makeSlug = require("./utilities.js").makeSlug;
const callableIsAuthorized = require("./utilities.js").callableIsAuthorized;
const Ajv = require("ajv");
const schema = require("./RawLogins.schema.json");
const functions = require("firebase-functions");
const _ = require("lodash");

const ajv = new Ajv({
  removeAdditional: true,
  coerceTypes: true,
  allErrors: true, // required for 'removeIfFails' keyword
});

const ajv_vanilla = new Ajv();
const validateCleanup = ajv_vanilla.compile({
  type: "object",
  additionalProperties: false,
  properties: {
    computerName: {
      $id: "#/properties/computerName",
      type: "string",
      title: "Computer name",
      examples: ["MHE-41KE281PH"],
      minLength: 1,
      maxLength: 48,
    },
  },
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
    return ``;
    // TODO: test validation-time code and branching
  },
  metaSchema: { type: "boolean" },
  statements: true, // allow side-effects and modification
  valid: true,
  modifying: true,
});

const validate = ajv.compile(schema);

exports.handler = async (req, res, db) => {
  // Validate the secret sent in the header from the client.
  const appSecret = functions.config().tybalt.radiator.secret;
  if (appSecret !== undefined) {
    const authHeader = req.get("Authorization");

    let reqSecret = null;
    if (authHeader !== undefined) {
      reqSecret = authHeader.replace("TYBALT ", "").trim();
    }
    if (reqSecret !== appSecret) {
      console.log(
        `${reqSecret} from ${authHeader} doesn't match expected ${appSecret}`
      );
      return res.status(401).send();
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

  // Validate the submission
  const valid = validate(d);
  // TODO: CUSTOM processing should be done here such as:
  /* 
    if (mfg === 'Red Hat' && model === 'KVM') {
      set serial to dnsHostname
    }
    const valid = validate(d);
  */

  try {
    if (!valid) {
      // Invalid submission, store RawLogin for later processing
      console.log("rawLogins: submission doesn't validate");
      console.log(validate.errors);
      if (_.isEmpty(d)) {
        console.log("empty submission, not saving");
        return res.status(400).send();
      } else {
        await db.collection("RawLogins").doc().set(d);
      }
    } else {
      // write valid object to database
      await storeValidLogin(d, db);
    }
    return res.status(202).send();
  } catch (error) {
    console.log(error.message);
    return res.status(500).send();
  }
};

// Creates or updates Computers and Users document, creates Logins document
async function storeValidLogin(d, db) {
  const slug = makeSlug(d.serial, d.mfg); // key for Computers collection
  const computerRef = db.collection("Computers").doc(slug);
  let userRef;
  try {
    // try to match existing user, otherwise make a new one. If database
    // inconsistencies are found (i.e. multiple matches) store RawLogin
    userRef = await getUserRef(d, db);
  } catch (error) {
    d.error = error.message;
    return db.collection("RawLogins").doc().set(d);
  }

  // TODO: delete all RawLogins where the serial matches this one since
  // we are getting a real login now, making them redundant

  // Start a write batch
  const batch = db.batch();

  d.updated = serverTimestamp();
  batch.set(computerRef, d, {
    merge: true,
  });

  userObject = {
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

async function getUserRef(d, db) {
  // If I user was deleted from the directory then recreated we don't want to
  // represent them twice in the database. We reuse the same user entry and
  // keep the previous ID/Document.
  // NB THIS REQUIRES THAT WE STORE d.userSourceAnchor in Users documents
  // The situation where a document exists with a key that matches another
  // document's userSourceAnchor property is problematic and needs to be
  // handled in this code. Essentially the key should only coincidentally match
  // a userSourceAnchor

  const usersRef = db.collection("Users");
  for (const prop of ["userSourceAnchor", "upn", "email"]) {
    // skip a property if it doesn't exist in d
    if (d[prop] === null || d[prop] === undefined) {
      continue;
    }

    // query for a user with matching prop
    // eslint-disable-next-line no-await-in-loop
    const result = await usersRef.where(prop, "==", d[prop].toLowerCase()).get();

    // throw if >1 result is returned, caller will set RawLogin
    if (result.size > 1) {
      throw new Error(`Multiple users have ${prop}:${d[prop].toLowerCase()}`);
    }

    // if exactly one result is returned, return its DocumentReference
    else if (result.size === 1) {
      return result.docs[0].ref;
    }
  }

  // if zero results are returned, return a ref to a new document
  // otherwise we'll overwrite an existing user.
  return db.collection("Users").doc();
}

// This function deletes all rawLogins except for the latest
// for each computerName. The deletion will be done on a batched
// write after querying what we want
// https://github.com/googleapis/nodejs-firestore/issues/64
exports.cleanup = async (data, context, db) => {
  console.log(`cleanup ${data.computerName}`);
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
    } catch (error) {
      return error.message;
    }
  } else {
    return `No items to cleanup for computerName ${data.computerName}`;
  }
};
