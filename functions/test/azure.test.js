const chai = require('chai')
const chaiAsPromised = require('chai-as-promised');
const assert = chai.assert;
chai.use(chaiAsPromised)

process.env.CLOUD_RUNTIME_CONFIG = JSON.stringify({
  app_id: "d574aed2-db53-4228-9686-31f9fb423d22",
  tenant_ids: ["non-GUID","9614d80a-2b3f-4ce4-bad3-7c022c06269e"]
});

const sinon = require('sinon');
const admin = require('firebase-admin');
const axios = require('axios');
const azureTestData = require('./azure.test.data.js');
const azureModule = require('../azure.js');

describe("azure module", () => {
  const id_token = azureTestData.id_token;
  const certStrings = azureTestData.certStrings;
  const openIdConfigURI = azureTestData.openIdConfigURI;
  const openIdConfigResponse = azureTestData.openIdConfigResponse;
  const jwks = azureTestData.jwks;
  const makeFirestoreStub = azureTestData.makeFirestoreStub; // Stub db = admin.firestore()

  describe("handler()", () => {
    const handler = azureModule.handler;
    const makeReqObject = azureTestData.makeReqObject; // Stub request object
    const makeResObject = azureTestData.makeResObject; // Stub response object
    const makeAuthStub = azureTestData.makeAuthStub; // Stub admin.auth()

    let clock, sandbox, axiosStub;
    beforeEach(function() {
      sandbox = sinon.createSandbox();
      axiosStub = sandbox.stub(axios, 'get');
      axiosStub.withArgs(openIdConfigURI).resolves(openIdConfigResponse);      
    });

    afterEach(function() { 
      sandbox.restore(); 
      try { clock.restore(); } catch (e) { /* useFakeTimers() wasn't used */ }
    });

    it("responds (405 Method Not Allowed) if request method isn't POST", async () => {
      let result = await handler({}, makeResObject());      
      assert.deepEqual(result.header.args[0], ['Allow','POST']);
      assert.equal(result.status.args[0][0],405);
    });
    it("responds (415 Unsupported Media Type) if Content-Type isn't application/json", async () => {
      const req = { method:'POST', get: sinon.stub().withArgs('Content-Type').returns('not/json') };
      let result = await handler(req, makeResObject());
      assert.equal(result.status.args[0][0], 415);
    });
    it("responds (401 Unauthorized) if id_token property is missing from request", async () => {
      let result = await handler(makeReqObject(), makeResObject());
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0],"no id_token provided");
    });
    it("responds (401 Unauthorized) if id_token in request is unparseable", async () => {
      axiosStub.withArgs(openIdConfigResponse.data.jwks_uri).resolves(jwks);
      let result = await handler(makeReqObject("fhqwhgads"), makeResObject(), makeFirestoreStub({ certStrings }) );
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0].toString(),"Error: Can't decode the token");
    });
    it("responds (401 Unauthorized) if matching public key for id_token cannot be found", async () => {
      // remove the correct key from jwks.data.keys[]
      jwksN = { data: { keys: jwks.data.keys.filter(jwk => jwk.kid !== '1234') }};
      axiosStub.withArgs(openIdConfigResponse.data.jwks_uri).resolves(jwksN);
      clock = sinon.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 UTC
      let result = await handler(makeReqObject(id_token), makeResObject(), makeFirestoreStub() );
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0].toString(),"Error: Can't find the token's certificate");
    });
    it("responds (401 Unauthorized) if id_token in request fails jwt.verify()", async () => {
      clock = sinon.useFakeTimers(1546305800000); // Jan 1, 2019 01:23:20 UTC
      let result = await handler(makeReqObject(id_token), makeResObject(), makeFirestoreStub({ certStrings }) );
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0].toString(),"TokenExpiredError: jwt expired");
      // TODO: assert that the body of the result is not a token
    });
    it("responds (403 Forbidden) if id_token in request is verified but audience isn't this app", async () => {
      clock = sinon.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 UTC
      const db = makeFirestoreStub({ certStrings });
      const authStub = sinon.stub(admin, 'auth').get( makeAuthStub({uidExists:true}) );
      let result = await handler(makeReqObject(id_token), makeResObject(), db);
      authStub.restore();
      assert.equal(result.status.args[0][0],403);
      assert.equal(result.send.args[0].toString(),"AudienceError: Provided token invalid for this application");
    });
    it("responds (403 Forbidden) if id_token in request is verified but issuer (tenant) isn't permitted by this app", async () => {
      clock = sinon.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 UTC
      const db = makeFirestoreStub({ certStrings });
      const authStub = sinon.stub(admin, 'auth').get( makeAuthStub({uidExists:true}) );
      let result = await handler(makeReqObject(id_token), makeResObject(), db);
      authStub.restore();
      assert.equal(result.status.args[0][0],403);
      assert.equal(result.send.args[0].toString(),"IssuerError: Provided token issued by foreign tenant");
    });
    it("responds (200 OK) with a new firebase token if id_token in request is verified whether tenant_ids are provided or not and whether fresh tokens are pulled from the cache or loaded from Microsoft", async () => {
      const options = {tenant_ids: ["337cf715-4186-4563-9583-423014c5e269"]};
      const authStubUserDoesNotExist = sinon.stub(admin, 'auth').get( makeAuthStub({uidExists:false}) );
      const db_cache_hit = makeFirestoreStub({ certStrings });
      const db_cache_miss = makeFirestoreStub();
      clock = sinon.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 UTC
      let result;

      // Test with no cached certificates, tenant options provided
      axiosStub.withArgs(openIdConfigResponse.data.jwks_uri).resolves(jwks); // microsoft responds with keys
      result = await handler(makeReqObject(id_token), makeResObject(), db_cache_miss, options);
      assert.equal(result.status.args[0][0],200);

      // Test with no cached certificates, tenant options not provided
      result = await handler(makeReqObject(id_token), makeResObject(), db_cache_miss);
      assert.equal(result.status.args[0][0],200);

      // Test with cached certificates, succeeds even though jwks can't be fetched
      axiosStub.withArgs(openIdConfigResponse.data.jwks_uri).rejects(); // microsoft fails to respond
      result = await handler(makeReqObject(id_token), makeResObject(), db_cache_hit, options);
      assert.equal(result.status.args[0][0],200);
      
      authStubUserDoesNotExist.restore(); // restore auth stub, we're going to reset it next

      const authStubUserExists = sinon.stub(admin, 'auth').get( makeAuthStub({uidExists:true}) );
      // Test with cached certificates, tenant options not provided, user already exists
      result = await handler(makeReqObject(id_token), makeResObject(), db_cache_hit);
      assert.equal(result.status.args[0][0],200);

      authStubUserExists.restore();

      // TODO: test for a valid new firebase token
    });
    it("fails if there are no cached certificates and it cannot fetch fresh ones", async () => {
      axiosStub.withArgs(openIdConfigResponse.data.jwks_uri).rejects(); // microsoft fails to respond
      const authStub = sinon.stub(admin, 'auth').get( makeAuthStub({uidExists:false}) );
      const db = makeFirestoreStub();
      let result = await handler(makeReqObject(id_token), makeResObject(), db);
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0].toString(),"Error: Missing certificates to validate token");

      authStub.restore();
    });
    it("respondes (501 Not Implemented) if creating or updating a user when another user has the same email", async () => {
      let stub = sinon.stub(admin, 'auth').get( makeAuthStub({emailExists:true}) );
      clock = sinon.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 UTC
      let result = await handler(makeReqObject(id_token), makeResObject(), makeFirestoreStub({ certStrings }) );
      stub.restore();
      assert.equal(result.status.args[0][0],501);
    });
    it("responds (500 Internal Server Error) if creating or updating a user fails", async () => {
      let authStub = sinon.stub(admin, 'auth').get( makeAuthStub({otherError:true}) );
      clock = sinon.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 UTC
      let result = await handler(makeReqObject(id_token), makeResObject(), makeFirestoreStub({ certStrings }) );
      authStub.restore();
      assert.equal(result.status.args[0][0],500);
      assert.equal(result.send.args[0][0],"auth/something-else");
    });
  });
});