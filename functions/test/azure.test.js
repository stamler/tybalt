const chai = require('chai')
const chaiAsPromised = require('chai-as-promised');
const assert = chai.assert;
chai.use(chaiAsPromised)

const decache = require('decache');
const sinon = require('sinon');
const azureTestData = require('./azure.test.data.js');
const shared = require('./shared.helpers.test.js');

describe("azure module", () => {
  process.env.FIREBASE_CONFIG = '{}'; // hack out missing FIREBASE_CONFIG warning
  const id_token = azureTestData.id_token;
  const certStrings = azureTestData.certStrings;
  const openIdConfigURI = azureTestData.openIdConfigURI;
  const openIdConfigResponse = azureTestData.openIdConfigResponse;
  const jwks = azureTestData.jwks;
  const makeFirestoreStub = shared.makeFirestoreStub; // Stub db = admin.firestore()
  const envVarsAppId = JSON.stringify({ azure_app_id: "d574aed2-db53-4228-9686-31f9fb423d22" });
  const envVarsTenantsDontMatch = JSON.stringify({ azure_allowed_tenants: ["non-GUID","9614d80a-2b3f-4ce4-bad3-7c022c06269e"] });
  const envVarsTenantsMatch = JSON.stringify({azure_allowed_tenants: ["non-GUID", "337cf715-4186-4563-9583-423014c5e269"]});

  describe("handler() responses", () => {
    const Req = shared.makeReqObject; // Stub request object
    const Res = shared.makeResObject; // Stub response object
    const makeAuthStub = azureTestData.makeAuthStub; // Stub admin.auth()

    let admin, axios, handler, sandbox, axiosStub, db_cache_hit, db_cache_miss;
    beforeEach(function() {
      admin = require('firebase-admin');
      axios = require('axios');

      sandbox = sinon.createSandbox();
      sandbox.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 UTC
      axiosStub = sandbox.stub(axios, 'get');
      axiosStub.withArgs(openIdConfigURI).resolves(openIdConfigResponse);
      axiosStub.withArgs(openIdConfigResponse.data.jwks_uri).resolves(jwks);
      sandbox.stub(admin, 'auth').get( makeAuthStub({uidExists:true}) );
      db_cache_hit = makeFirestoreStub({ certStrings });
      db_cache_miss = makeFirestoreStub();
      db_cache_expired = makeFirestoreStub({ 
        certStrings, 
        retrievedDate: new Date(1545300800000) // Dec 20, 2018 10:13:20 UTC 
      }); 
    });

    afterEach(function() { 
      sandbox.restore();
      decache('../azure.js');
      process.env.CLOUD_RUNTIME_CONFIG = '{}';
    });

    it("(405 Method Not Allowed) if request method isn't POST", async () => {
      handler = require('../azure.js').handler;
      let result = await handler(Req({token:id_token, method:'GET'}), Res());      
      assert.deepEqual(result.header.args[0], ['Allow','POST']);
      assert.equal(result.status.args[0][0],405);
    });
    it("(415 Unsupported Media Type) if Content-Type isn't application/json", async () => {
      handler = require('../azure.js').handler;
      let result = await handler(Req({token:id_token, contentType:'not/json'}), Res());
      assert.equal(result.status.args[0][0], 415);
    });
    it("(401 Unauthorized) if id_token property is missing from request", async () => {
      handler = require('../azure.js').handler;
      let result = await handler(Req(), Res());
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0][0],"no id_token provided");
    });
    it("(401 Unauthorized) if id_token is unparseable", async () => {
      handler = require('../azure.js').handler;
      let result = await handler(Req({token:"fhqwhgads"}), Res(), db_cache_hit );
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0][0].toString(),"Error: Can't decode the token");
    });
    it("(401 Unauthorized) if matching public key for id_token cannot be found", async () => {
      handler = require('../azure.js').handler;
      // remove signing public key (kid '1234')
      jwksN = { data: { keys: jwks.data.keys.filter(jwk => jwk.kid !== '1234') }};
      axiosStub.withArgs(openIdConfigResponse.data.jwks_uri).resolves(jwksN);
      let result = await handler(Req({token:id_token}), Res(), db_cache_miss );
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0][0].toString(),"Error: Can't find the token's certificate");
    });
    it("(401 Unauthorized) if id_token fails jwt.verify()", async () => {
      handler = require('../azure.js').handler;
      sandbox.useFakeTimers(1546305800000); // After 00h30, Jan 1, 2019 UTC
      let result = await handler(Req({token:id_token}), Res(), db_cache_hit );
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0][0].toString(),"TokenExpiredError: jwt expired");
      // TODO: assert that the body of the result is not a token
    });
    it("(403 Forbidden) if id_token is verified but audience isn't this app", async () => {
      process.env.CLOUD_RUNTIME_CONFIG = envVarsAppId; // Set env for audience
      handler = require('../azure.js').handler;
      let result = await handler(Req({token:id_token}), Res(), db_cache_hit);
      assert.equal(result.status.args[0][0],403);
      assert.equal(result.send.args[0][0].toString(),"AudienceError: Provided token invalid for this application");
    });
    it("(403 Forbidden) if id_token is verified but issuer (tenant) isn't permitted by this app", async () => {
      process.env.CLOUD_RUNTIME_CONFIG = envVarsTenantsDontMatch; // Set env for issuers
      handler = require('../azure.js').handler;
      let result = await handler(Req({token:id_token}), Res(), db_cache_hit);
      assert.equal(result.status.args[0][0],403);
      assert.equal(result.send.args[0][0].toString(),"IssuerError: Provided token issued by foreign tenant");
    });
    it("(200 OK) with a new firebase token if id_token is verified & tenant_ids match", async () => {
      process.env.CLOUD_RUNTIME_CONFIG = envVarsTenantsMatch; // Set env for issuers
      handler = require('../azure.js').handler;
      let result = await handler(Req({token:id_token}), Res(), db_cache_hit);
      assert.equal(result.status.args[0][0],200);
      assert.equal(result.send.args[0][0],azureTestData.stubFirebaseToken);
    });
    it("(200 OK) with a new firebase token if id_token is verified against cache or refreshed keys", async () => {
      handler = require('../azure.js').handler;
      
      // Cached certificates, user already exists
      let result = await handler(Req({token:id_token}), Res(), db_cache_hit);
      assert.equal(result.status.args[0][0],200);
      assert.equal(result.send.args[0][0],azureTestData.stubFirebaseToken);

      // Cached stale certificates, user already exists
      result = await handler(Req({token:id_token}), Res(), db_cache_expired);
      assert.equal(result.status.args[0][0],200);
      assert.equal(result.send.args[0][0],azureTestData.stubFirebaseToken);
      
      sandbox.stub(admin, 'auth').get( makeAuthStub({uidExists:false}) );

      // No cached certificates, user already exists
      result = await handler(Req({token:id_token}), Res(), db_cache_miss);
      assert.equal(result.status.args[0][0],200);
      assert.equal(result.send.args[0][0],azureTestData.stubFirebaseToken);

      // Cached certificates, user already exists, jwks can't be fetched
      axiosStub.withArgs(openIdConfigResponse.data.jwks_uri).rejects(); // microsoft fails to respond
      result = await handler(Req({token:id_token}), Res(), db_cache_hit);
      assert.equal(result.status.args[0][0],200);
      assert.equal(result.send.args[0][0],azureTestData.stubFirebaseToken);
      
    });
    it("(401 unauthorized) if there are no cached certificates and fresh ones cannot be fetched", async () => {
      handler = require('../azure.js').handler;
      axiosStub.withArgs(openIdConfigResponse.data.jwks_uri).rejects(); // microsoft fails to respond
      sandbox.stub(admin, 'auth').get( makeAuthStub({uidExists:false}) );
      let result = await handler(Req({token:id_token}), Res(), db_cache_miss);
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args[0][0].toString(),"Error: Missing certificates to validate token");
    });
    it("(501 Not Implemented) if creating or updating a user when another user has the same email", async () => {
      handler = require('../azure.js').handler;
      sandbox.stub(admin, 'auth').get( makeAuthStub({emailExists:true}) );
      let result = await handler(Req({token:id_token}), Res(), db_cache_hit );
      assert.equal(result.status.args[0][0],501);
    });
    it("(500 Internal Server Error) if creating or updating a user fails", async () => {
      handler = require('../azure.js').handler;
      sandbox.stub(admin, 'auth').get( makeAuthStub({otherError:true}) );
      let result = await handler(Req({token:id_token}), Res(), db_cache_hit );
      assert.equal(result.status.args[0][0],500);
      assert.equal(result.send.args[0][0],"auth/something-else");
    });
    it("(200 OK) with a new firebase token if id_token is verified and no db provided", async () => {
      handler = require('../azure.js').handler;
      let result = await handler(Req({token:id_token}), Res());
      assert.equal(result.status.args[0][0],200);
    });
  });
});