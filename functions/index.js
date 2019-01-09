// SDKs to create Cloud Functions and setup triggers,
// and to access the Firebase Firestore.
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
        d.hasOwnProperty('username') ) {
    if (d.serial !== null && d.manufacturer !== null && d.username !== null ) {
      if (d.serial.length>=4 && d.manufacturer.length>=2 && d.username.length>=4) {
        return true
      }
    }
  }
  return false
}

// Creates or updates Computers and Users collection (and maybe others)
function storeValidLogin(data) {
  
  // TODO: also update Users, possibly with another docRef in a different function
  const docRef = db.collection('Computers').doc(generateSlug(data.serial, data.manufacturer))
  return docRef.get().then(function(doc) {
    if (doc.exists) {
      // Update and return void promise
      // TODO: keep and validate only permitted properties
      // TODO: write to subcollections for historic data
        // 1. add valid properties that don't keep history to newObject
        // 2. update with merge with newObject
        // 3. update history in respective subcollections
        // 4. update with merge for new current values
      return docRef.update(data);
    } else {
      // Create and return void promise
      // TODO: keep and validate only permitted properties
        // 1. add valid properties to newObject
        // 2. set(newObject)
      // TODO: initialize subcollection for historic data
      return docRef.set(data);
    }
  });
}
