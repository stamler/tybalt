const fs = require('fs');
const path = require('path');
const sinon = require('sinon');
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

exports.certStrings = JSON.parse( fs.readFileSync( path.join(__dirname, 'ms-derived-certs.json')) );
exports.openIdConfigURI = 'https://login.microsoftonline.com/common/.well-known/openid-configuration';    
exports.openIdConfigResponse = { data: JSON.parse( fs.readFileSync( path.join(__dirname, 'ms-openid-configuration.json'))) };
exports.jwks = { data: JSON.parse( fs.readFileSync( path.join(__dirname, 'ms-keys.json'))) };


// Stub out db = admin.firestore()
exports.makeFirestoreStub = (options={}) => {
  const {
    retrievedDate = new Date(1546300800000), // Jan 1, 2019 00:00:00 UTC
    timestampsInSnapshots = true,
    certStrings = null
  } = options;

  // Stub the DocumentSnapshot returned by DocRef.get()
  const retrieved = {toDate: function () {return retrievedDate}};
  const getSnapStub = sinon.stub();
  if (certStrings) {
    getSnapStub.withArgs('retrieved').returns(retrieved); 
    getSnapStub.withArgs('certificates').returns(certStrings);  
  } else {
    getSnapStub.returns(undefined);
  }
  const azureSnap = { get: getSnapStub };
  const azureRef = {
    get: sinon.stub().resolves(azureSnap),
    set: sinon.stub().resolves()
  };

  // Stub the DocumentReference returned by collection().doc()
  const docStub = sinon.stub();
  docStub.withArgs('azure').returns(azureRef); 
  const collectionStub = sinon.stub();
  collectionStub.withArgs('Cache').returns({doc: docStub})

  return {collection: collectionStub };
};

exports.makeResObject = () => { 
  return { 
    header: sinon.spy(), status: sinon.stub().returnsThis(), 
    send: sinon.stub().returnsThis() 
  }; 
};

exports.makeReqObject = (options={}) => {
  const { method = 'POST', token = null, contentType = 'application/json' } = options;
  req = { 
    method:method, body: {}, 
    get: sinon.stub().withArgs('Content-Type').returns(contentType)
  };
  if (token) { req.body.id_token = token }
  return req;
};

// Stub out functions in admin.auth()
// See https://github.com/firebase/firebase-admin-node/issues/122#issuecomment-339586082
exports.makeAuthStub = (options={}) => {
  const {uidExists = true, emailExists = false, otherError = false} = options;
  const userRecord = {uid: '678', displayName: 'Testy Testerson', email:"ttesterson@company.com"};
  let authStub;
  if (emailExists) {
    authStub = sinon.stub().returns({
      updateUser: sinon.stub().throws({code: 'auth/email-already-exists'}),
      createUser: sinon.stub().throws({code: 'auth/email-already-exists'}),
      createCustomToken: sinon.stub() });
  } else if (otherError) {
    authStub = sinon.stub().returns({
      updateUser: sinon.stub().throws({code: 'auth/something-else'}),
      createUser: sinon.stub().throws({code: 'auth/something-else'}),
      createCustomToken: sinon.stub() });        
  } else {
    authStub = sinon.stub().returns({
      updateUser: uidExists ? sinon.stub().returns(userRecord) : sinon.stub().throws({code: 'auth/user-not-found'}),
      createUser: uidExists ? sinon.stub().throws({code: 'auth/uid-already-exists'}) : sinon.stub().returns(userRecord),
      createCustomToken: sinon.stub() });  
  }
  return function getterFn(){ return authStub; }
};
