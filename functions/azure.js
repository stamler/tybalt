const serverTimestamp = require('firebase-admin').firestore.FieldValue.serverTimestamp
const jwt = require('jsonwebtoken');
const axios = require('axios');

exports.handler = async (req, res, db) => {
  const certificates = await getCertificates(db);
  
  // get azure token from request header or body

  valid = await validAzureToken(token);
  if (valid) {
      // mint a firebase custom token with the information from token
  } else {
      res.sendStatus(403);
  }
}

async function validAzureToken(token) {
  // certificates = getCertificates()
  // get the signing certificate id from the token
  // verify the token with the signing key  
  // let validToken = jwt.verify(token, cert, verifyOptions);
  return false
}
   
// check firestore for certificates object. If it's stale or
// missing, retrieve it then save to azure document in Config

// TODO: The condition where azure config exists and has defined
// certificates and retrieved properties BUT values are STALE
// is not handled

async function getCertificates(db) {
  const azureRef = db.collection('Config').doc('azure')
  doc = await azureRef.get()

  if (doc.exists) {
    if (hasFreshCert(doc, 3600)) {
      return doc.get('certificates');
    } else {
      // Load fresh certificates from Microsoft

      // First get the open-id config 
      let openIdConfigURI = 'https://login.microsoftonline.com/' + doc.data().tenant + '/.well-known/openid-configuration';
      console.log("Getting OpenID config: " + openIdConfigURI );
      try {
        res = await axios.get(openIdConfigURI);
      } catch (error) {
        console.log("Error making external HTTP request. Are you on a free plan?");
        throw error;
      }
      
      // Then user open-id config to get the keys from Microsoft
      res = await axios.get(res.data.jwks_uri)
      console.log("obtained keys");
      
      // (re)build the certificates object with data returned from Microsoft
      certificates = {};
      for (let key of res.data.keys) {
        let x5c = key.x5c;
        let cert = '-----BEGIN CERTIFICATE-----\n' + x5c[0] +
            '\n-----END CERTIFICATE-----\n';
        certificates[key.kid] = cert
      }

      // Update certificates in existing Config/azure
      // that we confirmed exists earlier
      await azureRef.update({
          retrieved: serverTimestamp(), certificates: certificates });
      return certificates;
    }
  } else {
      console.log("Error: no azure document in Config");
      return undefined;  
  }
}

function hasFreshCert(doc, timeout) {
  let retrieved = doc.get('retrieved');
  let certificates = doc.get('certificates');

  if ( retrieved !== undefined && certificates !== undefined) {
    // TODO: Date.now() is probably not comparing properly with retrieved
    // due to mismatched types. This is probably the reason why Config/azure
    // gets updated every time and thus the caching is useless right now.
    if (Date.now() - retrieved < timeout ) {
      console.log("cached certificate is fresh enough");
      return true;
    }
  }
  return false;
}