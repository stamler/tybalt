/*

This module provides a handler() function that takes request and response
objects and the admin firestore instance object as its arguments.

The handler accepts only POST requests and examines them for an 
id_token provided by Azure AD. If it finds a valid token, it creates a
Firebase Custom Auth token that reflects the claims in the Azure token
then returns this token to the client (somehow)

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
    // TODO: also set Allow header
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Allow
    return res.status(405).send('You must POST to this endpoint');
  }

  // validate azure token from request body
  valid = await validAzureToken(req.body.token, db);

  if (valid !== null) {
    // TODO: mint a firebase custom token with the information from valid
    // admin.createCustomToken()?
    console.log(`Valid token received for ${valid.name}`);
    return res.sendStatus(200)
  } else {
    console.log(`Invalid token: ${req.body.token}`);
    return res.status(401).send("Couldn't validate a token");
  }
}

// returns the decoded payload of valid token, otherwise null
async function validAzureToken(token, db) {
  let certificate;
  try {
    let certificates = await getCertificates(db);
    certificate = certificates[jwt.decode(token, {complete: true}).header.kid];    
  } catch (error) {
    console.log(error);
    return null;
  }

  // verify the token
  try {
    const verifyOptions = {};
    let decoded = jwt.verify(token, certificate, verifyOptions);
    return decoded
  } catch (error) {
    console.log(error);    
    return null; 
  }
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
  // at this point certificates should be undefined, confirm 
  // and log if it isn't, probably a bug
  try {
    assert(certificates === undefined);    
  } catch (error) {
    console.log(error);  
  }

  certificates = {};
  for (let key of res.data.keys) {
    certificates[key.kid] = jwkToPem(key);
  }

  // Save certificates in the Cache/azure
  await azureRef.set({ retrieved: serverTimestamp(), 
    certificates: certificates }, {merge: true} );
  console.log("reloaded certificates");

  return certificates;  
}