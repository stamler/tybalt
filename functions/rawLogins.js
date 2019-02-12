const serverTimestamp = require('firebase-admin').firestore.FieldValue.serverTimestamp
const utilities = require('./utilities.js')
const filterProperties = utilities.filterProperties
const makeSlug = utilities.makeSlug

exports.handler = async (req, res, db) => {
  
  // req.body can be used directly as JSON if this passes
  if (req.get('Content-Type') !== "application/json") {
    return res.status(415).send();
  }

  if (req.method !== 'POST') {
    res.header('Allow', 'POST');
    return res.status(405).send();
  }

  const validationOptions = { 
    valid: [ "bootDrive", "bootDriveCap", "bootDriveFree",
    "bootDriveFS", "model", "computerName", "osArch", "osSku",
    "osVersion", "ram", "type", "upn", "email", "userGivenName", 
    "userSurname", "radiatorVersion" ],
    required: ["serial", "mfg", "userSourceAnchor", "networkConfig"],
    allowAndAddRequiredNulls: false
  };
  
  let raw = true, d = req.body;
  try {
    // TODO: if a submission is received with no user information, 
    // update the Computer document only?

    // Validate the submission
    d = filterProperties(req.body, validationOptions);
    raw = false;
  }
  catch (error) { 
    //console.log(`filterProperties(): ${error.message}, will storeRawLogin()`); 
  }

  try {
    if(raw) {
      // Invalid submission, add to RawLogins for later processing
      await storeRawLogin(d, db);
    } else {
      await storeValidLogin(d, db); //write valid object to database
    }
    return res.status(202).send();     
  } catch (error) {
    console.log(error.message);
    return res.status(500).send();
  }
}

// Creates or updates Computers and Users document, creates Logins document
async function storeValidLogin(d, db) {
  const slug = makeSlug(d.serial, d.mfg)  // key for Computers collection
  const computerRef = db.collection('Computers').doc(slug)
  let userRef;
  try {
    // try to match existing user, otherwise make a new one. If database
    // inconsistencies are found (i.e. multiple matches) store RawLogin
    userRef = await getUserRef(d, db);
  } catch (error) {
    d.error = error.message;
    return storeRawLogin(d, db);
  }

  // Start a write batch
  var batch = db.batch();

  d.updated = serverTimestamp()
  batch.set(computerRef,d, {merge: true});

  userObject = { upn: d.upn.toLowerCase(), email: d.email.toLowerCase(), 
    givenName: d.userGivenName, surname: d.userSurname, 
    lastComputer: slug, updated: serverTimestamp(),
    userSourceAnchor: d.userSourceAnchor.toLowerCase() };
  // TODO: Check if User has azureObjectID. If it doesn't,
  // try to match it with auth() users by upn/email (Soft match) and then
  // write the key to azureObjectID property
  batch.set(userRef, userObject, {merge: true});

  // Create new Login document
  let loginObject = { userSourceAnchor: d.userSourceAnchor.toLowerCase(),
    givenName: d.userGivenName, surname: d.userSurname,
    computer: slug, time: serverTimestamp() };
  batch.set(db.collection('Logins').doc(), loginObject);

  // Commit the batch which returns an array of WriteResults
  return batch.commit();
}

async function storeRawLogin(d, db) {
  d.datetime = serverTimestamp()
  return db.collection('RawLogins').add(d);
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

  const usersRef = db.collection('Users');
  for (let prop of ["userSourceAnchor", "upn", "email"]) {
    // query for a user with matching prop
    // eslint-disable-next-line no-await-in-loop
    let result = await usersRef.where(prop, "==", d[prop].toLowerCase()).get();

    // throw if >1 result is returned, caller will storeRawLogin()
    if ( result.size > 1 ) {
      throw new Error(`Multiple users have ${prop}:${d[prop].toLowerCase()}`);
    }

    // if exactly one result is returned, return its DocumentReference
    else if ( result.size === 1 ) {
      return result.docs[0].ref;
    }
  }

  // if zero results are returned, return a ref to a new document
  // otherwise we'll overwrite an existing user.
  return db.collection('Users').doc();
}