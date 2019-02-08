const serverTimestamp = require('firebase-admin').firestore.FieldValue.serverTimestamp
const utilities = require('./utilities.js')
const filterProperties = utilities.filterProperties
const makeSlug = utilities.makeSlug

exports.handler = async (req, res, db) => {
  
  // Reject non-JSON requests — Unsupported Media Type rfc7231#section-6.5.13
  // This allows use of req.body directly
  if (req.get('Content-Type') !== "application/json") {
    return res.sendStatus(415);
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
  catch (error) { console.log(error); }

  try {
    if(raw) {
      // Invalid submission, add to RawLogins for later processing
      d.datetime = serverTimestamp()
      await db.collection('RawLogins').add(d)
    } else {
      await storeValidLogin(d, db); //write valid object to database
    }
    return res.sendStatus(202);     
  } catch (error) {
    console.log(error);
    return res.sendStatus(500);
  }
}

// Creates or updates Computers and Users document, creates Logins document
async function storeValidLogin(d, db) {
  const slug = makeSlug(d.serial, d.mfg)  // key for Computers collection
  const computerRef = db.collection('Computers').doc(slug)

  // TODO: rather than just use the userSourceAnchor as the key:
  //  1. query Users for a user with a matching userSourceAnchor
  //  2. if more than one result is returned, log an error and send to raw logins
  //  3. if exactly one result is returned, get the document ID and assign it
  //     to userRef and proceed.
  //  4. if zero results are returned, query Users for a user with a matching upn
  //     (make sure to lowercase all upns stored in the database)
  //  5. if more than one result is returned, log an error and send to raw logins
  //  6. if exactly one resut is returned, get the document ID and assign it
  //     to userRef and proceed.
  //  7. if zero results are returned, use the existing code
  
  // Rationale for this change:
  // If I user was deleted from the directory then recreated we don't want to
  // represent them twice in the database. Rather we reuse the same one and
  // maintain the previous ID. NB THIS REQUIRES THAT WE STORE d.userSourceAnchor 
  // in Users documents

  const userRef = db.collection('Users').doc(d.userSourceAnchor)
  computerSnapshot = await computerRef.get()
  userSnapshot = await userRef.get()

  // Start a write batch
  var batch = db.batch();

  if (computerSnapshot.exists) {
    // Update existing Computer document
    d.updated = serverTimestamp()
    batch.update(computerRef, d);
  } else {
    // Create new Computer document
    d.created = d.updated = serverTimestamp();
    batch.set(computerRef,d);
  }

  userObject = { upn: d.upn.toLowerCase(), email: d.email.toLowerCase(), 
    givenName: d.userGivenName, surname: d.userSurname, 
    lastComputer: slug, updated: serverTimestamp(),
    userSourceAnchor: d.userSourceAnchor.toLowerCase() };
  // TODO: Check if userSnapshot contains azureObjectID. If it doesn't,
  // try to match it with auth() users by upn/email (Soft match) and then
  // write the key to azureObjectID property
  if (userSnapshot.exists) {
    // Update existing User document
    batch.update(userRef, userObject)
  } else {
    // Create new User document
    batch.set(userRef, userObject)
  }

  // Create new Login document
  let loginObject = { userSourceAnchor: d.userSourceAnchor.toLowerCase(),
    givenName: d.userGivenName, surname: d.userSurname,
    computer: slug, time: serverTimestamp() };
  batch.set(db.collection('Logins').doc(), loginObject);

  // Commit the batch which returns an array of WriteResults
  return batch.commit();
}