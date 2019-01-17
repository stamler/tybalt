const serverTimestamp = require('firebase-admin').firestore.FieldValue.serverTimestamp
const jwt = require('jsonwebtoken');
const axios = require('axios');

// TODO: Try/Catch the awaits!!

exports.handler = async (req, res, db) => {
  
  // for testing only
  var token = "";

  // get azure token from request header or body
  valid = await validAzureToken(token);

  if (valid) {
    // mint a firebase custom token with the information from token
    console.log("Time to make a Firebase Custom Auth Token!");   
  } else {
    console.log("Invalid token");    
    res.sendStatus(403);
  }
}

async function validAzureToken(token, db) {
  let certificate;
  try {
    let kid = jwt.decode(token)['kid'];
    let certificates = await getCertificates(db);
    certificate = certificates[kid];
  } catch (error) {
    console.log(error);
    return false;
  }

  // https://github.com/auth0/node-jsonwebtoken#jwtverifytoken-secretorpublickey-options-callback
  const verifyOptions = {};

  // verify the token
  try {
    let decoded = jwt.verify(token, certificate, verifyOptions);
    return true
  } catch (error) {
    console.log(error);    
    return false  
  }
}
   
// get cached or fresh certificates depending on 
// whether they're fresh or stale/missing
async function getCertificates(db) {
  const azureRef = db.collection('Config').doc('azure')
  snap = await azureRef.get()

  if (snap.exists) {
    if (hasFreshCert(snap, 86400)) {
      return snap.get('certificates');
    } else {
      // Load fresh certificates from Microsoft

      // First get the open-id config 
      let openIdConfigURI = 'https://login.microsoftonline.com/' + snap.data().tenant + '/.well-known/openid-configuration';
      try {
        res = await axios.get(openIdConfigURI);
      } catch (error) {
        console.log("Error making external HTTP request. Are you on a free plan?");
        throw error;
      }
      
      // Then user open-id config to get the keys from Microsoft
      res = await axios.get(res.data.jwks_uri)
      
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
      console.log("reloaded certificates");

      return certificates;
    }
  } else {
      console.log("No 'azure' document was found in Config.\n" +
        "At minimum this document should exist and have a 'tenant' property\n" +
        "containing a string representing the Azure tenant.");
      return undefined;  
  }
}

function hasFreshCert(snapshot, timeout) {
  let retrieved = snapshot.get('retrieved');
  let certificates = snapshot.get('certificates');

  if ( retrieved !== undefined && certificates !== undefined) {
    // timeout arg is given in seconds, Date is in msec
    if (Date.now() - retrieved.toDate() < timeout * 1000 ) {
      console.log("Cached certificates less than " + timeout + " seconds old.");
      return true;
    }
  }
  return false;
}