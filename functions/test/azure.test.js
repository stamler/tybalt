const chai = require('chai')
const chaiAsPromised = require('chai-as-promised');
const assert = chai.assert;
chai.use(chaiAsPromised)

const decache = require('decache');
const sinon = require('sinon');
const admin = require('firebase-admin');
const axios = require('axios');
const azureTestData = require('./azure.test.data.js');

describe("azure module", () => {
  process.env.FIREBASE_CONFIG = '{}'; // hack out missing FIREBASE_CONFIG warning
  const id_token = azureTestData.id_token;
  const certStrings = azureTestData.certStrings;
  const openIdConfigURI = azureTestData.openIdConfigURI;
  const openIdConfigResponse = azureTestData.openIdConfigResponse;
  const jwks = azureTestData.jwks;
  const makeFirestoreStub = azureTestData.makeFirestoreStub; // Stub db = admin.firestore()
  const cloudRuntimeConfig = JSON.stringify({ azure_app_id: "d574aed2-db53-4228-9686-31f9fb423d22", azure_allowed_tenants: ["non-GUID","9614d80a-2b3f-4ce4-bad3-7c022c06269e"] });

  describe("handler()", () => {
    const makeReqObject = azureTestData.makeReqObject; // Stub request object
    const makeResObject = azureTestData.makeResObject; // Stub response object
    const makeAuthStub = azureTestData.makeAuthStub; // Stub admin.auth()

    let handler, sandbox, axiosStub, authStub, db_cache_hit, db_cache_miss;
    beforeEach(function() {
      handler = require('../azure.js').handler;
      sandbox = sinon.createSandbox();
      sandbox.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 UTC
      axiosStub = sandbox.stub(axios, 'get');
      axiosStub.withArgs(openIdConfigURI).resolves(openIdConfigResponse);
      axiosStub.withArgs(openIdConfigResponse.data.jwks_uri).resolves(jwks);
      authStub = sandbox.stub(admin, 'auth').get( makeAuthStub({uidExists:true}) );
      db_cache_hit = makeFirestoreStub({ certStrings });
      db_cache_miss = makeFirestoreStub();
    });

    afterEach(function() { 
      sandbox.restore();
      // TODO: decache('../azure.js') here without breaking everything
      // so that environment variables can be set per test
    });

    it("responds (405 Method Not Allowed) if request method isn't POST", async () => {
      let result = await handler(makeReqObject({token:id_token, method:'GET'}), makeResObject());      
      assert.deepEqual(result.header.args[0], ['Allow','POST']);
      assert.equal(result.status.args[0][0],405);
    });
    it("responds (415 Unsupported Media Type) if Content-Type isn't application/json", async () => {
      let result = await handler(makeReqObject({token:id_token, contentType:'not/json'}), makeResObject());
      assert.equal(result.status.args[0][0], 415);
    });
    it("responds (401 Unauthorized) if id_token property is missing from request", async () => {
      let result = await handler(makeReqObject(), makeResObject());
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0],"no id_token provided");
    });
    it("responds (401 Unauthorized) if id_token in request is unparseable", async () => {
      let result = await handler(makeReqObject({token:"fhqwhgads"}), makeResObject(), db_cache_hit );
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0].toString(),"Error: Can't decode the token");
    });
    it("responds (401 Unauthorized) if matching public key for id_token cannot be found", async () => {
      // remove signing public key (kid '1234')
      jwksN = { data: { keys: jwks.data.keys.filter(jwk => jwk.kid !== '1234') }};
      axiosStub.withArgs(openIdConfigResponse.data.jwks_uri).resolves(jwksN);
      let result = await handler(makeReqObject({token:id_token}), makeResObject(), db_cache_miss );
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0].toString(),"Error: Can't find the token's certificate");
    });
    it("responds (401 Unauthorized) if id_token in request fails jwt.verify()", async () => {
      sandbox.useFakeTimers(1546305800000); // After 00h30, Jan 1, 2019 UTC
      let result = await handler(makeReqObject({token:id_token}), makeResObject(), db_cache_hit );
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0].toString(),"TokenExpiredError: jwt expired");
      // TODO: assert that the body of the result is not a token
    });
    it("responds (403 Forbidden) if id_token in request is verified but audience isn't this app", async () => {
      // Set environment variables to test audience and issuers
    /*
      process.env.CLOUD_RUNTIME_CONFIG = cloudRuntimeConfig;
      decache('../azure.js');
      handler = require('../azure.js').handler;
    */
      
      let result = await handler(makeReqObject({token:id_token}), makeResObject(), db_cache_hit);
      assert.equal(result.status.args[0][0],403);
      assert.equal(result.send.args[0].toString(),"AudienceError: Provided token invalid for this application");
    /*  
      process.env.CLOUD_RUNTIME_CONFIG = '{}';
      decache('../azure.js');
      handler = require('../azure.js').handler;
    */
    });
    it("responds (403 Forbidden) if id_token in request is verified but issuer (tenant) isn't permitted by this app", async () => {
      let result = await handler(makeReqObject({token:id_token}), makeResObject(), db_cache_hit);
      assert.equal(result.status.args[0][0],403);
      assert.equal(result.send.args[0].toString(),"IssuerError: Provided token issued by foreign tenant");
    });
    it("responds (200 OK) with a new firebase token if id_token in request is verified whether tenant_ids are provided or not and whether fresh tokens are pulled from the cache or loaded from Microsoft", async () => {
      let result;
      
      // Cached certificates, user already exists
      result = await handler(makeReqObject({token:id_token}), makeResObject(), db_cache_hit);
      assert.equal(result.status.args[0][0],200);
      
      sandbox.stub(admin, 'auth').get( makeAuthStub({uidExists:false}) );

      // No cached certificates, user already exists
      result = await handler(makeReqObject({token:id_token}), makeResObject(), db_cache_miss);
      assert.equal(result.status.args[0][0],200);

      // Cached certificates, user already exists, jwks can't be fetched
      axiosStub.withArgs(openIdConfigResponse.data.jwks_uri).rejects(); // microsoft fails to respond
      result = await handler(makeReqObject({token:id_token}), makeResObject(), db_cache_hit);
      assert.equal(result.status.args[0][0],200);
      
      // TODO: test with environment variables
      // TODO: test for a valid new firebase token
    });
    it("fails if there are no cached certificates and it cannot fetch fresh ones", async () => {
      axiosStub.withArgs(openIdConfigResponse.data.jwks_uri).rejects(); // microsoft fails to respond
      sandbox.stub(admin, 'auth').get( makeAuthStub({uidExists:false}) );
      let result = await handler(makeReqObject({token:id_token}), makeResObject(), db_cache_miss);
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0].toString(),"Error: Missing certificates to validate token");
    });
    it("respondes (501 Not Implemented) if creating or updating a user when another user has the same email", async () => {
      sandbox.stub(admin, 'auth').get( makeAuthStub({emailExists:true}) );
      let result = await handler(makeReqObject({token:id_token}), makeResObject(), db_cache_hit );
      assert.equal(result.status.args[0][0],501);
    });
    it("responds (500 Internal Server Error) if creating or updating a user fails", async () => {
      sandbox.stub(admin, 'auth').get( makeAuthStub({otherError:true}) );
      let result = await handler(makeReqObject({token:id_token}), makeResObject(), db_cache_hit );
      assert.equal(result.status.args[0][0],500);
      assert.equal(result.send.args[0][0],"auth/something-else");
    });
  });
});