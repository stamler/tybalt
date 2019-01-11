const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore()

// Get a raw login and update Computers and Users. If it's somehow
// incomplete write it to RawLogins collection for later processing
exports.rawLogins = functions.https.onRequest((req, res) => {

  // Reject requests with wrong Content-Type
  if (req.get('Content-Type') !== "application/json") {
    // per RFC 7231 https://tools.ietf.org/html/rfc7231#section-6.5.13
    return res.sendStatus(415)
  }

  // Add a timestamp sentinel to the body so it can be stored
  // See https://github.com/angular/angularfire2/issues/1292
  let d = req.body
  d.datetime = admin.firestore.FieldValue.serverTimestamp()

  if (isValidLogin(d)) {
    // The submission validates, write to Computers and Users
    return storeValidLogin(d)
      .then((docRef) => { return res.sendStatus(202) })
      .catch((error) => { return res.sendStatus(500) });  
  } else {
    // Invalid submission, add to RawLogins for later processing
    return db.collection('RawLogins').add(d)
      .then((docRef) => { return res.sendStatus(202) })
      .catch((error) => { return res.sendStatus(500) });  
  }

});

// create a serial,mfg identifier slug
function generateSlug(serial, mfg) {
  return serial.trim() + ',' + mfg.toLowerCase().replace('.','').replace(',','')
    .replace('inc','').replace('ltd','').trim().replace(' ','_');
}

function isValidLogin(d) {
  if (d.hasOwnProperty('serial') && d.hasOwnProperty('manufacturer') &&
        d.hasOwnProperty('upn') && d.hasOwnProperty('user') ) {
    if (d.serial !== null && d.manufacturer !== null && 
      d.upn !== null && d.user !== null ) {
      if (d.serial.length>=4 && d.manufacturer.length>=2 && 
        d.upn.length>=6 && d.user.length >= 6) {
        return true
      }
    }
  }
  return false
}

// Creates or updates Computers document, and creates Logins document
// Logins are simple documents with three properties: timestamp, 
// computer slug, and upn. These can be queried quickly so we 
// can see login history for a computer or upn. The Computer
// document only stores the last login upn and updated timestamp
// TODO: update corresponding Users document with id of last computer login?

function storeValidLogin(d) {

  // Load properties to computerObject, ignoring other properties
  // TODO: validate the loaded properties
  // TODO: handle exception when some of the properties are 
  // not contained in 'd'. The current method does guarantee that these
  // properties exist, which is one useful method of validation and could
  // be preserved. The upn is toLowerCase() so that it can be easily compared
  var computerObject = { 
    boot_drive: d.boot_drive, boot_drive_cap: d.boot_drive_cap, 
    boot_drive_free: d.boot_drive_free, boot_drive_fs: d.boot_drive_fs,
    manufacturer: d.manufacturer, model: d.model, name: d.name, 
    os_arch: d.os_arch, os_sku: d.os_sku, os_version: d.os_version, ram: d.ram,
    serial: d.serial, type: d.type, last_upn: d.upn.toLowerCase(), 
    last_user: d.user, network_config: d.network_config };

  const slug = generateSlug(d.serial, d.manufacturer)
  
  var loginObject = { 
    upn: d.upn, user: d.user, computer: slug,
    time: admin.firestore.FieldValue.serverTimestamp() };

  const computerRef = db.collection('Computers').doc(slug)
  const loginRef = db.collection('Logins')

  return computerRef.get().then((doc) => {
    var batch = db.batch();

    if (doc.exists) {
      // Update existing Computer document
      computerObject.updated = admin.firestore.FieldValue.serverTimestamp()
      batch.update(computerRef, computerObject);
    } else {
      // Create new Computer document
      computerObject.created = admin.firestore.FieldValue.serverTimestamp()
      batch.set(computerRef,computerObject);
    }

    // Create new Login document
    batch.set(loginRef.doc(),loginObject);
    return batch.commit();

  });
}
