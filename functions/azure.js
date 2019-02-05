/*

This module provides a handler() function that takes request and response
objects and the admin firestore instance object as its arguments.

The handler accepts only POST requests and examines them for an 
id_token provided by Azure AD. If it finds a valid token, it creates or updates
the user in Firebase Authentication then mints a Firebase Custom Auth token 
that reflects the claims in the Azure token. Finally it returns 
this token to the client

About Azure ID tokens (from Microsoft):
ID Tokens should be used to validate that a user is who they claim to be
and get additional useful information about them - it should not be used 
for authorization in place of an access token. The claims it provides can 
be used for UX inside your application, keying a database, and providing 
access to the client application. 

*/

const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const jwkToPem = require('jwk-to-pem');
const assert = require('assert');

exports.handler = async (req, res, options={}) => {
  const { app_id = null, tenant_ids = [], certificates = null } = options;

  if (req.method !== 'POST') {
    res.header('Allow', 'POST');
    return res.status(405).send();
  }

  if (req.get('Content-Type') !== "application/json") {
    return res.status(415).send();
  }

  if (!req.body.hasOwnProperty("id_token")) {
    return res.status(401).send("no id_token provided");
  }

  // validate azure token from request body
  let valid;
  try { valid = await validAzureToken(req.body.id_token, certificates); }
  catch (error) { return res.status(401).send(`${error}`); }

  // Check the app_id
  // This functionality can be rolled into options on jwt.verify()
  // but is kept here to provide better errors to the client
  if ( app_id && valid.aud !== app_id ) {
    return res.status(403).send("AudienceError: Provided token invalid for this application");
  }

  // Check the tenant_ids array
  if (tenant_ids.length > 0) {
    const iss_guid = valid.iss.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
    if (iss_guid && !tenant_ids.includes(iss_guid[0])) {
      // GUID extracted from the iss claim IS NOT in the array of tenant_ids
      return res.status(403).send("IssuerError: Provided token issued by foreign tenant");
    }
  }
  
  /*
  
  Issue: we need to have some way to durably correlate the auth user with 
  properties in the Cloud Firestore database. However since the Azure 
  Object ID isn't present in on-premesis logins and also since the ImmutableID
  found in Azure (which does map to On-prem sourceAnchor) isn't 
  a claim in the token, we cannot set up the correlation right away.

  Instead, we correlate them in a Users collection with a key of 
  sourceAnchor which contains a document for each User and can be 
  populated by either computer Logins, Manually, or via Logins throught the
  web app. The synchronized state is that a document contains at least an
  Azure Object ID and an AD sourceAnchor. It can have other useful 
  information for a profile including links to profile pictures.

  A Users document can only be created by the rawLogins function or manually
  When it's being created it checks for a auth() object with matching email
  and if that object exists assigns its key to its own azure_oid property

  An auth() user can only be created by the auth().createUser() method. 
  Using functions.auth.user().onCreate() event handler to updating the
  corresponding Users document with matching email is one approach.

  Similarly functions.auth.user().onDelete() could be used to strip the 
  Azure Object ID from the corresponding Users document were a deletion to
  occur

  /// Follow the soft match / hard match model
    ==> https://docs.microsoft.com/en-us/azure/active-directory/hybrid/how-to-connect-install-existing-tenant#sync-with-existing-users-in-azure-ad

  When rawLogins is triggered if a document in Users already exists with a
  key that matches the sourceAnchor that document is updated, 
  otherwise it is created. If an auth user exists with the same upn/email,
  that auth user's key will be written to the Users document and a soft-match
  flag will be set.

  */

  // Create or update the user then mint a firebase custom token for the user
  // TODO: consider breaking this into a function for testability. Specific 
  // issues include depending on firebase admin functions
  const uid = valid.oid;
  const properties = {displayName: valid.name, email: valid.email};

  let userRecord;
  try {
    // try updating the user first
    userRecord = await admin.auth().updateUser(uid, properties);      
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      // if the user doesn't exist then create it
      userRecord = await admin.auth().createUser({ uid, ...properties});
    } else if (error.code === 'auth/email-already-exists') {
      return res.status(501).send("A user with this email address and a different Object ID already exists. Either the user who used to use that email address must sign in to update their address and and fix the conflict, or an administrator must delete that user's auth account in the database so the new user can assume the email address.");
    } else {
      console.log(error);
      return res.status(500).send(error.code);
    }
  }
  
  // TODO: when minting the firebase token, include roles assigned in
  // the firebase Users collection document for this user.
  // mint the token
  const firebaseCustomToken = await admin.auth().createCustomToken(userRecord.uid);
  return res.status(200).send(firebaseCustomToken);
}

// returns the decoded payload of valid token. Caller must handle exceptions
// certificates is an object of format { kid1: pem_cert1, kid2: pem_cert2 }
async function validAzureToken(token, certificates) {
  
  let kid, decoded, certificate;
  try { 
    decoded = jwt.decode(token, {complete: true});
    kid = decoded.header.kid; 
  }
  catch (error) { throw new Error("Can't decode the token"); }

  try { certificate = certificates[kid]; } 
  catch (error) { throw new Error("Can't find the token's certificate"); }

  // return verified decoded token payload
  return jwt.verify(token, certificate);
}

// returns object with keys as cert kid and values as certificate pems
// uses cached certificates if available and fresh, otherwise fetches from 
exports.getCertificates = async function (db) {
  const azureRef = db.collection('Cache').doc('azure');
  let snap = await azureRef.get();

  let retrieved = snap.get('retrieved');
  let certificates = snap.get('certificates');

  // Return cached certificates if they're not stale
  if ( retrieved !== undefined && certificates !== undefined) {
    // 1 day timeout in msec
    if (Date.now() - retrieved.toDate() < 86400 * 1000 ) {
      return certificates;
    }
  }
  
  // Get fresh certificates from Microsoft
  let openIdConfigURI = 'https://login.microsoftonline.com/common/' +
    '.well-known/openid-configuration';
  let res;
  try {
    res = await axios.get(openIdConfigURI); // Get the OpenID config
    res = await axios.get(res.data.jwks_uri); // Get up-to-date JWKs
  } catch (error) {
    /* 
      This thrown error is wrapped in a rejected Promise
      https://thecodebarbarian.com/unhandled-promise-rejections-in-node.js.html
      https://www.valentinog.com/blog/throw-errors-async-functions-javascript/
      https://dev.to/ccleary00/why-isnt-this-unit-test-catching-an-error-from-this-asyncawait-function-3oae
    */
    throw new Error("Failed to fetch certificates from Microsoft");
  }
  
  // build a certificates object with data from Microsoft
  certificates = {};
  for (let key of res.data.keys) {
    certificates[key.kid] = jwkToPem(key);
  }

  // Cache certificates in Cloud Firestore
  // TODO: BUG !!! make sure to OVERWRITE existing certificates completely when doing 
  // a cache refresh otherwise old certificates will behave in a valid way
  await azureRef.set({
    retrieved: admin.firestore.FieldValue.serverTimestamp(),
    certificates: certificates
  });

  return certificates;  
}