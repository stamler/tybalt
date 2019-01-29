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

const serverTimestamp = require('firebase-admin').firestore.FieldValue.serverTimestamp
const jwt = require('jsonwebtoken');
const axios = require('axios');
const jwkToPem = require('jwk-to-pem');
const assert = require('assert');

exports.handler = async (req, res, db) => {

  if (req.method !== 'POST') {
    res.header('Allow', 'POST');
    return res.sendStatus(405);
  }

  if (req.get('Content-Type') !== "application/json") {
    return res.sendStatus(415);
  }

  if (!req.body.hasOwnProperty("id_token")) {
    return res.status(401).send("no id_token provided");
  }

  // validate azure token from request body
  let valid = null;
  try { valid = await validAzureToken(req.body.id_token, db); }
  catch (error) { return res.status(401).send(`${error}`); }

  if (valid !== null) {
    // TODO: Get Azure Application ID from Firestore OR ENVIRONMENT and verify
    // that it matches valid.aud so we're not minting tokens for the wrong
    // application. If there's no match, return HTTP 401 unauthorized with
    // a message of "This token is valid but won't work for this Application"

    // TODO: validate valid.nonce matches submitted value in the client app

    // TODO: when minting the firebase token, include roles assigned in
    // the firebase Users collection document for this user.
    
    /*

    About The Firebase Auth collection:
    Firebase Auth will use Azure Object ID as the key (uid, oid ) as this value
    never changes. Upon receiving a valid Azure id_token with a previously 
    unused oid, we will create a new user in Firebase auth with this value as
    the key. We will also update properties related to the user, specifically
    name and email. At this point the auth user will not be correlated with
    the rest of the database.
    
    Issue: we need to have some way to durably correlate the auth user with 
    properties in the Cloud Firestore database. However since the Azure 
    Object ID isn't present in on-premesis logins and also since the ImmutableID
    found in Azure (which does map to On-prem ms-DS-ConsistencyGuid) isn't 
    exporable in the token, we cannot set up the correlation right away.

    Instead, we correlate them in a Users collection with a key of 
    ms-DS-ConsistencyGuid which contains a document for each User and can be 
    populated by either computer Logins, Manually, or via Logins throught the
    web app. The synchronized state is that a document contains at least an
    Azure Object ID and an AD ms-DS-ConsistencyGuid. It can have other useful 
    information for a profile including links to profile pictures.

    A Users document can only be created by the rawLogins function or manually
    When it's being created it checks for a auth() object with matching email
    and if that object exists assigns its key to its own azure_oid property

    An auth() user can only be created by the auth().createUser() method. 
    Perhaps we can observe it's creation and trigger updating a corresponding
    Users document with matching email if it exists.

    /// Follow the soft match / hard match model
      ==> https://docs.microsoft.com/en-us/azure/active-directory/hybrid/how-to-connect-install-existing-tenant#sync-with-existing-users-in-azure-ad

    When rawLogins is triggered if a document in Users already exists with a
    key that matches the ms-DS-ConsistencyGuid that document is updated, 
    otherwise it is created. If an auth user exists with the same upn/email,
    that auth user's key will be written to the Users document and a soft-match
    flag will be set.

    */

    // TODO: mint a firebase custom token with the information from valid
    // 1. First get claims about the user from the valid token
    const oid = valid.oid;
    const claims = {name: valid.name, email: valid.email};

    // admin.auth().updateUser()
    // admin.auth().createUser()
    // admin.auth().createCustomToken()
    console.log(`Valid token received for ${valid.name}`);
    return res.sendStatus(200)
  }

  return res.sendStatus(500);
}

// returns the decoded payload of valid token. 
// Caller must handle exceptions from both jwt.decode() and jwt.verify()
async function validAzureToken(token, db) {
  if (token === undefined) { throw new Error("No token found"); }
  let certificates = await getCertificates(db);
  
  let kid, certificate;
  try { kid = jwt.decode(token, {complete: true}).header.kid; }
  catch (error) { throw new Error("Can't decode the token"); }

  try { certificate = certificates[kid]; } 
  catch (error) { throw new Error("Can't find the token's certificate"); }

  // return verified decoded token payload
  return jwt.verify(token, certificate);
}

// returns object with keys as cert kid and values as public certificate pems
// uses cached certificates if available and fresh, otherwise fetches from 
async function getCertificates(db) {
  const azureRef = db.collection('Cache').doc('azure');
  snap = await azureRef.get();

  let retrieved = snap.get('retrieved');
  let certificates = snap.get('certificates');

  if ( retrieved !== undefined && certificates !== undefined) {
    // 1 day timeout in msec
    if (Date.now() - retrieved.toDate() < 86400 * 1000 ) {
      return certificates;
    }
  }
  
  // Load and cache fresh certificates from Microsoft

  // Get the OpenID config from the Microsoft common URL
  // Then use it to get Microsoft's up-to-date JWKs
  let openIdConfigURI = 'https://login.microsoftonline.com/common/' +
    '.well-known/openid-configuration';
  let res;
  try {
    res = await axios.get(openIdConfigURI);
    res = await axios.get(res.data.jwks_uri);
  } catch (error) {
    console.log("Error making external HTTP request. You on a free plan?");
    throw error;
  }
  
  // build the certificates object with data from Microsoft
  try {
    assert(certificates === undefined);    
  } catch (error) {
    console.log("Stale certificates were loaded, fetching new ones...");
  }

  certificates = {};
  for (let key of res.data.keys) {
    certificates[key.kid] = jwkToPem(key);
  }

  // Save certificates in the Cache/azure
  await azureRef.set({ retrieved: serverTimestamp(), 
    certificates: certificates }, {merge: true} );
  console.log("Certificates updated");

  return certificates;  
}