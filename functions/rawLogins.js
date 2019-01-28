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
    valid: [ "boot_drive", "boot_drive_cap", "boot_drive_free", 
    "boot_drive_fs", "model", "computer_name", "os_arch", "os_sku",
    "os_version", "ram", "type", "upn", "email", "user_given_name", 
    "user_surname", "network_config", "radiator_version" ],
    required: ["serial", "mfg", "user_sourceAnchor"],
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

  const userRef = db.collection('Users').doc(d.user_sourceAnchor)
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

  userObject = { upn: d.upn, email: d.email, givenName: d.user_given_name, 
    surname: d.user_surname, lastComputer: slug, updated: serverTimestamp() };
  // TODO: Check if userSnapshot contains azure_ObjectID. If it doesn't,
  // try to match it with auth() users by upn/email (Soft match) and then
  // write the key to azure_ObjectID property
  if (userSnapshot.exists) {
    // Update existing User document
    batch.update(userRef, userObject)
  } else {
    // Create new User document
    batch.set(userRef, userObject)
  }

  // Create new Login document
  let loginObject = { userSourceAnchor: d.user_sourceAnchor, 
    givenName: d.user_given_name, surname: d.user_surname, 
    computer: slug, time: serverTimestamp() }; 
  batch.set(db.collection('Logins').doc(), loginObject);

  // Commit the batch which returns an array of WriteResults
  return batch.commit();
}