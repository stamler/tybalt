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
const functions = require('firebase-functions');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const jwkToPem = require('jwk-to-pem');

exports.handler = async (req, res, db) => {

  // get environment variables
  let app_id = null, tenant_ids = [];
  try {
    const azureConfig = functions.config().tybalt.azure;
    app_id = azureConfig.appid || null;
    const tenant_string = azureConfig.allowedtenants;
    if (tenant_string !== undefined) {
      tenant_ids = JSON.parse(azureConfig.allowedtenants);
    }  
  } catch (error) {
    console.log(`some or all env variables missing: ${error}`);
  }

  if (req.method === 'OPTIONS') {
    // Preflight response for CORS
    // TODO: restrict this further instead of '*'
    res.set('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET');
    return res.status(200).send();
  } 

  if (req.method !== 'GET') {
    res.header('Allow', 'GET');
    return res.status(405).send();
  }

  if (req.get('Content-Type') !== "application/json") {
    return res.status(415).send();
  }

  // Get id_token from Authorization header by parsing Bearer <ID_TOKEN>
  const authHeader = req.get('Authorization');
  let id_token = null;
  if (authHeader !== undefined) {
    id_token = authHeader.replace('Bearer ','').trim();
  }
  if (id_token === null || id_token.length < 8) { // arbitrary minimum length of accepted JWT
    return res.status(401).send("no id_token provided");
  }

  // validate azure token from request
  let valid;
  try { valid = await validAzureToken(id_token, db); }
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
  
  // mint the token
  const firebaseCustomToken = await admin.auth().createCustomToken(userRecord.uid);
  // TODO: restrict this further instead of '*'
  res.header('Access-Control-Allow-Origin', '*');
  return res.status(200).send(firebaseCustomToken);
}

// returns the decoded payload of valid token. Caller must handle promise rejection
async function validAzureToken(token, db) {

  // certificates is an object of format { kid1: pem_cert1, kid2: pem_cert2 }
  let certificates;
  try { certificates = await getCertificates(db); } 
  catch (error) {     
    throw new Error("Missing certificates to validate token"); 
  }

  let kid, decoded, certificate;
  try { 
    decoded = jwt.decode(token, {complete: true});
    kid = decoded.header.kid; 
  }
  catch (error) { throw new Error("Can't decode the token"); }
  
  certificate = certificates[kid];
  if (certificate === undefined) { throw new Error("Can't find the token's certificate"); }

  // return verified decoded token payload
  return jwt.verify(token, certificate);
}

// returns object with keys as cert kid and values as certificate pems
// uses cached certificates if available and fresh, otherwise fetches from 
async function getCertificates(db) {
  
  let azureRef;
  if (db) {
    // attempt cache retrieval
    azureRef = db.collection('Cache').doc('azure');
    const snap = await azureRef.get();

    const retrieved = snap.get('retrieved');
    const cachedCerts = snap.get('certificates');

    // Return cached certificates if they're not stale
    if ( retrieved !== undefined && cachedCerts !== undefined) {
      // 1 day timeout in msec
      if (Date.now() - retrieved.toDate() < 86400 * 1000 ) {
        return cachedCerts;
      }
    }
  }

  // Get fresh certificates from Microsoft
  const openIdConfigURI = 'https://login.microsoftonline.com/common/' +
    '.well-known/openid-configuration';

  let res = await axios.get(openIdConfigURI); // Get the OpenID config
  res = await axios.get(res.data.jwks_uri); // Get up-to-date JWKs
  
  // build a fresh certificates object with data from Microsoft
  const freshCerts = {};
  for (let key of res.data.keys) {
    freshCerts[key.kid] = jwkToPem(key);
  }

  if (db) {
    // cache fresh certs 
    await azureRef.set({
      retrieved: admin.firestore.FieldValue.serverTimestamp(),
      certificates: freshCerts
    });
  }

  return freshCerts;
}