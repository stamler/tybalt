const serverTimestamp = require('firebase-admin').firestore.FieldValue.serverTimestamp

exports.handler = async (req, res, db) => {
  
  // Reject non-JSON requests — Unsupported Media Type rfc7231#section-6.5.13
  if (req.get('Content-Type') !== "application/json") {
    return res.sendStatus(415) 
  }

  // Filter submission for allowed properties
  let d = filterLogin(req.body)
  
  try {
    if (isValidDomainLogin(d)) {
      // TODO: if a submission is received with no user information, update the Computer document only
      // The submission validates, write to Computers and Users
      await storeValidLogin(d, db)
    } else {
      // Invalid submission, add to RawLogins for later processing
      d.datetime = serverTimestamp()
      docRef = await db.collection('RawLogins').add(d)
    }
    return res.sendStatus(202)
  } catch (e) {
    console.log(e);
    return res.sendStatus(500)
  }
}


// create a serial,mfg identifier slug
function makeSlug(serial, mfg) {
  return serial.trim() + ',' + mfg.toLowerCase().replace('.','').replace(',','')
    .replace('inc','').replace('ltd','').trim().replace(' ','_');
}
  
function filterLogin(data) {
  const validPropList = [ "boot_drive", "boot_drive_cap", "boot_drive_free", 
    "boot_drive_fs", "mfg", "model", "computer_name", "os_arch", "os_sku",
      "os_version", "ram", "serial", "type", "upn", "user_given_name", 
      "user_surname", "network_config", "user_sourceAnchor", 
      "radiator_version" ]
  let filteredObject = {} 
  for (let i = 0; i < validPropList.length; i++) {
    let field = validPropList[i]
    if ( data.hasOwnProperty( field ) ) {
      filteredObject[ field ] = data[ field ]
    } else {
      // TODO: add null fields here if they're not present? 
      // filteredObject [ field ] = null
    }
  }
  return filteredObject
}
  
function isValidDomainLogin(d) {
  // TODO: much more improvement of validation
  if (d.hasOwnProperty('serial') && d.hasOwnProperty('mfg') &&
        d.hasOwnProperty('user_sourceAnchor') ) {
    if (d.serial !== null && d.mfg !== null && d.user_sourceAnchor !== null) {
      // TODO: Verify user_sourceAnchor is a 128-bit base64-encoded string
      if (d.serial.length>=4 && d.mfg.length>=2 ) {
        return true
      }
    }
  }
  return false
}
  
// Creates or updates Computers document, and creates Logins document
// TODO: update corresponding Users document with slug of last computer login
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
    // Create new Computer document, set both created and updated
    d.created = serverTimestamp()
    d.updated = serverTimestamp()
    batch.set(computerRef,d);
  }

  userInfo = { upn: d.upn, givenName: d.user_given_name, 
    surname: d.user_surname, updated: serverTimestamp() };
  // TODO: Check if userSnapshot contains azure_ObjectID. If it doesn't,
  // try to match it with auth() users by upn/email (Soft match) and then
  // write the key to azure_ObjectID property
    if (userSnapshot.exists) {
    // Update existing User document
    batch.update(userRef, userInfo)
  } else {
    // Create new User document
    batch.set(userRef, userInfo)
  }

  // Create a new Login Document with 4 properties: timestamp, computer slug, 
  // surname/givenName, and user_sourceAnchor. These can be queried for 
  // login history 
  let loginObject = { user_sourceAnchor: d.user_sourceAnchor, 
    user_given_name: d.user_given_name, user_surname: d.user_surname, 
    computer: slug, time: serverTimestamp() }; 
  batch.set(db.collection('Logins').doc(), loginObject);

  // Commit the batch which returns an array of WriteResults
  return batch.commit();
}
  