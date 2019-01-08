// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access the Firebase Realtime Database.
const admin = require('firebase-admin');

const base = 'https://console.firebase.google.com/project/' + 
                process.env.GCLOUD_PROJECT +  '/database/firestore/data'

admin.initializeApp();

const db = admin.firestore()

// Take the text parameter passed to this HTTP endpoint and insert it into the
// Realtime Database under the path /messages/:addId/original
exports.addMessage = functions.https.onRequest((req, res) => {
    // Grab the text parameter.
    const original = req.query.text;
    // Add the message into the Cloud Firestore using the Firebase Admin SDK
    return db.collection('/messages').add({original: original}).then((docRef) => {
      // Redirect with 303 SEE OTHER to the URL of the pushed object in the Firebase console.
      return res.redirect(303, base + docRef.path);
    });
  });
  
// Listens for new messages added to /messages/:addId/original and creates an
// uppercase version of the message to /messages/:addId/uppercase
exports.makeUppercase = functions.firestore.document('/messages/{addId}')
.onCreate((docSnap, context) => {
  // Grab the current value of what was written to the Realtime Database.
  const original = docSnap.data().original
  console.log('Uppercasing', context.params.addId, original);
  const uppercase = original.toUpperCase();
  // You must return a Promise when performing asynchronous tasks inside a Functions such as
  // writing to the Firebase Realtime Database.
  // Setting an "uppercase" sibling in the Realtime Database returns a Promise.
  return docSnap.ref.update({uppercase: uppercase});
});

// Get a raw login and update Computers and Users. If it's somehow
// incomplete write it to RawLogins collection for later processing
exports.rawLogins = functions.https.onRequest((req, res) => {

  // We expect the request to be sent with a content type application/json
  if (req.get('Content-Type') !== "application/json") {
    // per RFC 7231 https://tools.ietf.org/html/rfc7231#section-6.5.13
    return res.sendStatus(415)
  }

  let d = req.body
  // See https://github.com/angular/angularfire2/issues/1292
  d.datetime = admin.firestore.FieldValue.serverTimestamp()

  // If the submission validates update Computers and Users
  if (d.serial !== null && d.serial.length >= 4 && 
      d.manufacturer !== null && d.manufacturer.length >= 2 &&
      d.username !== null ) {
    return db.collection('Computers').add(d)
    .then((docRef) => { return res.sendStatus(202) })
    .catch((error) => { return res.sendStatus(500) });
  
  } else {
    // If the submission doesn't validate then 
    // add to RawLogins for later processing
    return db.collection('RawLogins').add(d)
    .then((docRef) => { return res.sendStatus(202) })
    .catch((error) => { return res.sendStatus(500) });  
  }

});