const chai = require('chai')
chai.use(require('chai-as-promised'))
const assert = chai.assert;

describe("azure module", () => {
  process.env.FIREBASE_CONFIG = '{}'; // hack out missing FIREBASE_CONFIG warning
  const admin = require('firebase-admin');
  const functions = require('firebase-functions');
  const axios = require('axios');
  const sinon = require('sinon');
  const azureTestData = require('./azure.test.data.js');
  const shared = require('./shared.helpers.test.js');
  const id_token = azureTestData.id_token;
  const certStrings = azureTestData.certStrings;
  const openIdConfigURI = azureTestData.openIdConfigURI;
  const openIdConfigResponse = azureTestData.openIdConfigResponse;
  const jwks = azureTestData.jwks;
  const makeFirestoreStub = shared.makeFirestoreStub; // Stub db = admin.firestore()
  const stubFirebaseToken = shared.stubFirebaseToken;

  describe("handler() responses", () => {
    const Req = shared.makeReqObject; // Stub request object
    const Res = shared.makeResObject; // Stub response object
    const makeAuthStub = shared.makeAuthStub; // Stub admin.auth()
    const handler = require('../azure.js').handler;
    const db_cache_hit = makeFirestoreStub({ certStrings });
    const db_cache_miss = makeFirestoreStub();
    const db_cache_expired = makeFirestoreStub({ 
      certStrings,
      retrievedDate: new Date(1545300800000) // Dec 20, 2018 10:13:20 UTC
    });
    const sandbox = sinon.createSandbox();

    let axiosStub;

    // eslint-disable-next-line prefer-arrow-callback
    beforeEach(function() {
      sandbox.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 UTC
      axiosStub = sandbox.stub(axios, 'get');
      axiosStub.withArgs(openIdConfigURI).resolves(openIdConfigResponse);
      axiosStub.withArgs(openIdConfigResponse.data.jwks_uri).resolves(jwks);
      sandbox.stub(admin, 'auth').get( makeAuthStub({uidExists:true}) );
      sandbox.stub(functions, 'config').returns({tybalt: {azure: {}}});
    });

    // eslint-disable-next-line prefer-arrow-callback
    afterEach(function() { 
      sandbox.restore();
    });

    it("(200 OK) if request is OPTIONS", async () => {
      let result = await handler(Req({method:'OPTIONS'}), Res());
      assert.deepEqual(result.header.args[0], ["Access-Control-Allow-Headers","Content-Type, Authorization"]);
      assert.deepEqual(result.header.args[1], ["Access-Control-Allow-Methods","GET"]);
      assert.deepEqual(result.set.args[0], ["Access-Control-Allow-Origin","*"]);
      assert.equal(result.status.args[0][0],200);
    });
    it("(405 Method Not Allowed) if request method isn't GET", async () => {
      let result = await handler(Req({token:id_token}), Res());
      assert.deepEqual(result.header.args[0], ['Allow','GET']);
      assert.equal(result.status.args[0][0],405);
    });
    it("(415 Unsupported Media Type) if Content-Type isn't application/json", async () => {
      let result = await handler(Req({method:'GET', token:id_token, contentType:'not/json'}), Res());
      assert.equal(result.status.args[0][0], 415);
    });
    it("(401 Unauthorized) if Authorization header is missing from request", async () => {
      let result = await handler(Req({method:'GET'}), Res());
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0][0],"no id_token provided");
    });
    it("(401 Unauthorized) if id_token is unparseable", async () => {
      let result = await handler(Req({method:'GET', token:"fhqwhgads"}), Res(), db_cache_hit );
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0][0].toString(),"Error: Can't decode the token");
    });
    it("(401 Unauthorized) if matching public key for id_token cannot be found", async () => {
      // remove signing public key (kid '1234')
      jwksN = { data: { keys: jwks.data.keys.filter(jwk => jwk.kid !== '1234') }};
      axiosStub.withArgs(openIdConfigResponse.data.jwks_uri).resolves(jwksN);
      let result = await handler(Req({method:'GET', token:id_token}), Res(), db_cache_miss );
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0][0].toString(),"Error: Can't find the token's certificate");
    });
    it("(401 Unauthorized) if id_token fails jwt.verify()", async () => {
      sandbox.useFakeTimers(1546305800000); // After 00h30, Jan 1, 2019 UTC
      let result = await handler(Req({method:'GET', token:id_token}), Res(), db_cache_hit );
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0][0].toString(),"TokenExpiredError: jwt expired");
      // TODO: assert that the body of the result is not a token
    });
    it("(403 Forbidden) if id_token is verified but audience isn't this app", async () => {
      // stub environment variables for audience
      functions.config.restore();
      sandbox.stub(functions, 'config').returns({tybalt: {azure: {appid: "d574aed2-db53-4228-9686-31f9fb423d22"}}});
      let result = await handler(Req({method:'GET', token:id_token}), Res(), db_cache_hit);
      assert.equal(result.status.args[0][0],403);
      assert.equal(result.send.args[0][0].toString(),"AudienceError: Provided token invalid for this application");
    });
    it("(403 Forbidden) if id_token is verified but issuer (tenant) isn't permitted by this app", async () => {
      // stub environment variables for audience and tenants
      functions.config.restore()
      sandbox.stub(functions, 'config').returns({tybalt: {azure: {
        appid: "12354894-507e-4095-9d42-1c5ebb952856",
        allowedtenants: '["non-GUID","9614d80a-2b3f-4ce4-bad3-7c022c06269e"]'
      }}});
      let result = await handler(Req({method:'GET', token:id_token}), Res(), db_cache_hit);
      assert.equal(result.status.args[0][0],403);
      assert.equal(result.send.args[0][0].toString(),"IssuerError: Provided token issued by foreign tenant");
    });
    it("(200 OK) with a new firebase token if id_token is verified and there is no environment config", async () => {
      functions.config.restore()
      sandbox.stub(functions, 'config').returns({});
      const constub = sandbox.stub(console, "log");
      let result = await handler(Req({method:'GET', token:id_token}), Res(), db_cache_hit);
      assert.deepEqual(constub.args[0][0],"some or all env variables missing: TypeError: Cannot read property 'azure' of undefined");
      assert.equal(result.status.args[0][0],200);
      assert.equal(result.send.args[0][0],stubFirebaseToken);
    });
    it("(200 OK) with a new firebase token if id_token is verified & tenant_ids match", async () => {
      // stub environment variables for tenants
      functions.config.restore()
      sandbox.stub(functions, 'config').returns({tybalt: {azure: {
        allowedtenants: '["non-GUID", "337cf715-4186-4563-9583-423014c5e269"]'
      }}});      
      let result = await handler(Req({method:'GET', token:id_token}), Res(), db_cache_hit);
      assert.equal(result.status.args[0][0],200);
      assert.equal(result.send.args[0][0],stubFirebaseToken);
    });
    it("(200 OK) with a new firebase token if id_token is verified against cache or refreshed keys", async () => {

      // Cached certificates, user already exists
      let result = await handler(Req({method:'GET', token:id_token}), Res(), db_cache_hit);
      assert.equal(result.status.args[0][0],200);
      assert.equal(result.send.args[0][0],stubFirebaseToken);

      // Cached stale certificates, user already exists
      result = await handler(Req({method:'GET', token:id_token}), Res(), db_cache_expired);
      assert.equal(result.status.args[0][0],200);
      assert.equal(result.send.args[0][0],stubFirebaseToken);
      
      sandbox.stub(admin, 'auth').get( makeAuthStub({uidExists:false}) );

      // No cached certificates, user already exists
      result = await handler(Req({method:'GET', token:id_token}), Res(), db_cache_miss);
      assert.equal(result.status.args[0][0],200);
      assert.equal(result.send.args[0][0],stubFirebaseToken);

      // Cached certificates, user already exists, jwks can't be fetched
      axiosStub.withArgs(openIdConfigResponse.data.jwks_uri).rejects(); // microsoft fails to respond
      result = await handler(Req({method:'GET', token:id_token}), Res(), db_cache_hit);
      assert.equal(result.status.args[0][0],200);
      assert.equal(result.send.args[0][0],stubFirebaseToken);
      
    });
    it("(401 unauthorized) if there are no cached certificates and fresh ones cannot be fetched", async () => {
      axiosStub.withArgs(openIdConfigResponse.data.jwks_uri).rejects(); // microsoft fails to respond
      sandbox.stub(admin, 'auth').get( makeAuthStub({uidExists:false}) );
      let result = await handler(Req({method:'GET', token:id_token}), Res(), db_cache_miss);
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0][0].toString(),"Error: Missing certificates to validate token");
    });
    it("(501 Not Implemented) if creating or updating a user when another user has the same email", async () => {
      sandbox.stub(admin, 'auth').get( makeAuthStub({emailExists:true}) );
      let result = await handler(Req({method:'GET', token:id_token}), Res(), db_cache_hit );
      assert.equal(result.status.args[0][0],501);
    });
    it("(500 Internal Server Error) if creating or updating a user fails", async () => {
      sandbox.stub(admin, 'auth').get( makeAuthStub({otherError:true}) );
      const constub = sandbox.stub(console, "log");
      let result = await handler(Req({method:'GET', token:id_token}), Res(), db_cache_hit );
      sinon.assert.calledOnce(constub);
      assert.equal(result.status.args[0][0],500);
      assert.equal(result.send.args[0][0],"auth/something-else");
    });
  });
});