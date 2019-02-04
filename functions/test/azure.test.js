const assert = require('chai').assert;
const jwt = require('jsonwebtoken');
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const axios = require('axios');
const azureModule = require('../azure.js');

describe("azure module", () => {
  // Keypair generated at https://8gwifi.org/jwkfunctions.jsp
  // Reference set from Microsoft https://login.microsoftonline.com/common/discovery/keys
  const key = fs.readFileSync(path.join(__dirname, 'key.pem'), 'ascii');
  const options = { certificates: {'1234': fs.readFileSync(path.join(__dirname, 'cert.pem'), 'ascii') }, app_id: null, tenant_ids: [] };
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
  const id_token = jwt.sign(payload, key, {algorithm: 'RS256', keyid:'1234'});
  
  describe("handler()", () => {
    const handler = azureModule.handler;
    const makeResObject = () => { 
      return { 
        header: sinon.spy(), status: sinon.stub().returnsThis(), 
        send: sinon.stub().returnsThis() 
      }; 
    };
    const makeReqObject = (token) => { 
      req = { 
        method:'POST', body: {}, 
        get: sinon.stub().withArgs('Content-Type').returns('application/json') 
      };
      if (token) { req.body.id_token = token }
      return req;
    };

    // Stub out functions in admin.auth()
    // See https://github.com/firebase/firebase-admin-node/issues/122#issuecomment-339586082
    const makeAuthStub = (options={}) => {
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

    let clock; // declare sinon's clock and try to restore after each test
    afterEach(() => { try { clock.restore(); } catch (e) { /* useFakeTimers() wasn't used */ } }); 

    it("01 responds (405 Method Not Allowed) if request method isn't POST", async () => {
      let result = await handler({}, makeResObject());      
      assert.deepEqual(result.header.args[0], ['Allow','POST']);
      assert.equal(result.status.args[0][0],405);
    });
    it("02 responds (415 Unsupported Media Type) if Content-Type isn't application/json", async () => {
      const req = { method:'POST', get: sinon.stub().withArgs('Content-Type').returns('not/json') };
      let result = await handler(req, makeResObject());
      assert.equal(result.status.args[0][0], 415);
    });
    it("03 responds (401 Unauthorized) if id_token property is missing from request", async () => {
      let result = await handler(makeReqObject(), makeResObject());
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0],"no id_token provided");
    });
    it("04 responds (401 Unauthorized) if id_token in request is unparseable", async () => {
      let result = await handler(makeReqObject("fhqwhgads"), makeResObject(), options);
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0].toString(),"Error: Can't decode the token");
    });
    it("05 responds (401 Unauthorized) if matching certificate for id_token cannot be found", async () => {
      let result = await handler(makeReqObject(id_token), makeResObject());
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0].toString(),"Error: Can't find the token's certificate");
    });
    it("06 responds (401 Unauthorized) if id_token in request fails jwt.verify()", async () => {
      clock = sinon.useFakeTimers(1546305800000); // Jan 1, 2019 01:23:20 UTC
      let result = await handler(makeReqObject(id_token), makeResObject(), options);
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0].toString(),"TokenExpiredError: jwt expired");
      // TODO: assert that the body of the result is not a token
    });
    it("07 responds (403 Forbidden) if id_token in request is verified but audience isn't this app", async () => {
      clock = sinon.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 UTC
      let handlerOptions = { ...options };
      handlerOptions.app_id = "d574aed2-db53-4228-9686-31f9fb423d22";
      let result = await handler(makeReqObject(id_token), makeResObject(), handlerOptions);
      assert.equal(result.status.args[0][0],403);
      assert.equal(result.send.args[0].toString(),"AudienceError: Provided token invalid for this application");
    });
    it("08 responds (403 Forbidden) if id_token in request is verified but issuer (tenant) isn't permitted by this app", async () => {
      clock = sinon.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 UTC
      let handlerOptions = { ...options };
      handlerOptions.tenant_ids = ["non-GUID","9614d80a-2b3f-4ce4-bad3-7c022c06269e"];
      let result = await handler(makeReqObject(id_token), makeResObject(), handlerOptions);
      assert.equal(result.status.args[0][0],403);
      assert.equal(result.send.args[0].toString(),"IssuerError: Provided token issued by foreign tenant");
    });
    it("09 responds (200 OK) with a new firebase token if id_token in request is verified and tenant_ids are provided", async () => {
      let stub = sinon.stub(admin, 'auth').get( makeAuthStub({uidExists:false}) );
      clock = sinon.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 UTC
      let handlerOptions = { ...options };
      handlerOptions.tenant_ids = ["337cf715-4186-4563-9583-423014c5e269"];
      let result = await handler(makeReqObject(id_token), makeResObject(), handlerOptions);
      stub.restore();
      assert.equal(result.status.args[0][0],200);
      // TODO: test for a valid new firebase token
    });
    it("10 responds (200 OK) with a new firebase token if id_token in request is verified", async () => {
      let stub = sinon.stub(admin, 'auth').get( makeAuthStub({uidExists:true}) );
      clock = sinon.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 UTC
      let result = await handler(makeReqObject(id_token), makeResObject(), options);
      stub.restore();
      assert.equal(result.status.args[0][0],200);
      // TODO: test for a valid new firebase token
    });
    it("11 respondes (501 Not Implemented) if creating or updating a user when another user has the same email", async () => {
      let stub = sinon.stub(admin, 'auth').get( makeAuthStub({emailExists:true}) );
      clock = sinon.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 UTC
      let result = await handler(makeReqObject(id_token), makeResObject(), options);
      stub.restore();
      assert.equal(result.status.args[0][0],501);
    });
    it("12 responds (500 Internal Server Error) if creating or updating a user fails", async () => {
      let stub = sinon.stub(admin, 'auth').get( makeAuthStub({otherError:true}) );
      clock = sinon.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 UTC
      let result = await handler(makeReqObject(id_token), makeResObject(), options);
      stub.restore();
      assert.equal(result.status.args[0][0],500);
      assert.equal(result.send.args[0][0],"auth/something-else");
    });

  });

  describe("getCertificates()", () => {
    // Stub out db = admin.firestore()
    const makeFirestoreStub = (options={}) => {
      const { timestampsInSnapshots = true } = options;

      // Stub the DocumentSnapshot returned by DocRef.get()
      // Jan 1, 2019 00:00:00 UTC will be the "retrieved" time in the data
      const retrieved = {toDate: function () {return new Date(1546300800000)}};
      const getSnapStub = sinon.stub();
      getSnapStub.withArgs('retrieved').returns(retrieved); 
      getSnapStub.withArgs('certificates').returns("--- CERTS ---");
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
    }

    const getCertificates = azureModule.getCertificates;
    const openIdConfigURI = 'https://login.microsoftonline.com/common/.well-known/openid-configuration';    
    const openIdConfigResponse = { data: JSON.parse( fs.readFileSync( path.join(__dirname, 'ms-openid-configuration.json'))) };
    const jwks = { data: JSON.parse( fs.readFileSync( path.join(__dirname, 'ms-keys.json'))) };
    const certStrings = JSON.parse( fs.readFileSync( path.join(__dirname, 'ms-derived-certs.json')) );

    let stub;
    before(function() {
      stub = sinon.stub(axios, 'get');
      stub.withArgs(openIdConfigURI).resolves(openIdConfigResponse);      
      stub.withArgs(openIdConfigResponse.data.jwks_uri).resolves(jwks);
    });

    after(function() {
      stub.restore();
    });
    
    it("refreshes the cache if it's stale, overwriting previously cached certificates", async () => {
      
      const db = makeFirestoreStub();
      const certificates = await getCertificates(db);

      assert.deepEqual(certificates, certStrings.certificates);
      // TODO: Test that stale cache certificates are actually overwritten
    });
    it("returns cached certificates from the database if they're fresh", async () => {
      clock = sinon.useFakeTimers(1546305800000); // Jan 1, 2019 01:23:20 UTC
      assert.equal(true,false);
    });
    it("loads certificates from Microsoft if they're missing");
  });
});