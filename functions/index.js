const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore()

// Get a raw login and update Computers and Users. If it's somehow
// incomplete write it to RawLogins collection for later processing
exports.rawLogins = functions.https.onRequest(async (req, res) => {
  // Reject non-JSON requests — Unsupported Media Type rfc7231#section-6.5.13
  if (req.get('Content-Type') !== "application/json") {
    return res.sendStatus(415) 
  }

  // Filter submission for allowed properties and add timestamp
  let d = filterLogin(req.body)
  d.datetime = admin.firestore.FieldValue.serverTimestamp()

  try {
    if (isValidLogin(d)) {
      // The submission validates, write to Computers and Users
      await storeValidLogin(d)
    } else {
      // Invalid submission, add to RawLogins for later processing
      docRef = await db.collection('RawLogins').add(d)
    }
    return res.sendStatus(202)
  } catch (e) {
    return res.sendStatus(500)
  }
});

// create a serial,mfg identifier slug
function makeSlug(serial, mfg) {
  return serial.trim() + ',' + mfg.toLowerCase().replace('.','').replace(',','')
    .replace('inc','').replace('ltd','').trim().replace(' ','_');
}

function filterLogin(data) {
  const validPropList = [ "boot_drive", "boot_drive_cap", "boot_drive_free", 
    "boot_drive_fs", "mfg", "model", "computer_name", "os_arch", "os_sku",
     "os_version", "ram", "serial", "type", "upn", "user", "network_config",
     "user_objectGUID" ]
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

function isValidLogin(d) {
  if (d.hasOwnProperty('serial') && d.hasOwnProperty('mfg') &&
        d.hasOwnProperty('upn') && d.hasOwnProperty('user') ) {
    if (d.serial !== null && d.mfg !== null && 
      d.upn !== null && d.user !== null ) {
      if (d.serial.length>=4 && d.mfg.length>=2 && 
        d.upn.length>=6 && d.user.length >= 6) {
        return true
      }
    }
  }
  return false
}

// Creates or updates Computers document, and creates Logins document
// TODO: update corresponding Users document with slug of last computer login
async function storeValidLogin(d) {
  // the key in the Computers collection
  const slug = makeSlug(d.serial, d.mfg)
  
  // Logins are documents with 4 properties: timestamp, computer slug, 
  // upn, and user objectGUID. These can be queried quickly so we 
  // can see login history for a computer or user. 
  var loginObject = {
    objectGUID: d.user_objectGUID, user: d.user, computer: slug,
    time: admin.firestore.FieldValue.serverTimestamp() };

  const computerRef = db.collection('Computers').doc(slug)
  const loginRef = db.collection('Logins')

  doc = await computerRef.get()
  var batch = db.batch();

  if (doc.exists) {
    // Update existing Computer document
    d.updated = admin.firestore.FieldValue.serverTimestamp()
    batch.update(computerRef, d);
  } else {
    // Create new Computer document
    d.created = admin.firestore.FieldValue.serverTimestamp()
    batch.set(computerRef,d);
  }

  // Create new Login document
  batch.set(loginRef.doc(),loginObject);

  // commit() returns an array of WriteResults
  return batch.commit();
}
