const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

// Keypair generated at https://8gwifi.org/jwkfunctions.jsp
// Reference set from Microsoft https://login.microsoftonline.com/common/discovery/keys
const key = fs.readFileSync(path.join(__dirname, 'key.pem'), 'ascii');
const payload = {
  // Azure Application ID
  "aud": "12354894-507e-4095-9d42-1c5ebb952856",

  // Issuer, contains Tenant ID (Directory ID)
  "iss": "https://login.microsoftonline.com/337cf715-4186-4563-9583-423014c5e269/v2.0",

  // 2018-12-31 23:30:00 UTC to 2019-01-01 00:30:00 UTC
  "iat": 1546299000, "nbf": 1546299000, "exp": 1546302600,

  // The user's Object ID
  "oid": "775a90f3-94ff-43d2-8197-22d928c08cf2", "nonce": "42",
  "email": "ttesterson@company.com", "name": "Testy Testerson",
  "sub": "RcMorzOb7Jm4mimarvKUnGsBDOGquydhqOF7JeZTfpI", "ver": "2.0"
};
exports.id_token = jwt.sign(payload, key, {algorithm: 'RS256', keyid:'1234'});
//exports.stubFirebaseToken = "eyREALTOKENVALUE";
exports.certStrings = JSON.parse( fs.readFileSync( path.join(__dirname, 'ms-derived-certs.json')) );
exports.openIdConfigURI = 'https://login.microsoftonline.com/common/.well-known/openid-configuration';    
exports.openIdConfigResponse = { data: JSON.parse( fs.readFileSync( path.join(__dirname, 'ms-openid-configuration.json'))) };
exports.jwks = { data: JSON.parse( fs.readFileSync( path.join(__dirname, 'ms-keys.json'))) };
