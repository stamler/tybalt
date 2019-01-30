const assert = require('chai').assert;
const jwt = require('jsonwebtoken');
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');
const azureModule = require('../azure.js');

// TODO: Create a fake "Azure id_token" signed by the generated fake keys for testing. 
// https://github.com/auth0/node-jsonwebtoken/blob/master/test/verify.tests.js#L81

describe("azure module", () => {
  // Keypair generated at https://8gwifi.org/jwkfunctions.jsp
  // Reference set from Microsoft https://login.microsoftonline.com/common/discovery/keys
  const key = fs.readFileSync(path.join(__dirname, 'key.pem'), 'ascii');
  const cert = fs.readFileSync(path.join(__dirname, 'cert.pem'), 'ascii');
  const jwk_cert = JSON.parse(fs.readFileSync(path.join(__dirname, 'jwk.json')));
  const azure_id_token_payload = {
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
  const id_token = jwt.sign(azure_id_token_payload, key, {algorithm: 'RS256', keyid:'1234'});
  
  describe("handler()", () => {
    const handler = azureModule.handler;

    let clock; // declare sinon's clock and try to restore after each test
    afterEach(() => { try { clock.restore(); } catch (e) {} }); 

    // TODO: stub out getCertificates() for testing the rest of the handler
    it("responds (405 Method Not Allowed) if request method isn't POST", async () => {
      const req = {}; const db = {};
      const res = { header: sinon.spy(), sendStatus: sinon.stub().returnsThis() };
      let result = await handler(req, res, db);      
      assert.deepEqual(result.header.args[0], ['Allow','POST']);
      assert.equal(result.sendStatus.args[0], 405);
    });

    it("responds (415 Unsupported Media Type) if Content-Type is not application/json", async () => {
      const req = { method:'POST',
        get: function (field) { assert.equal(field, 'Content-Type'); return "not/json"; } 
      };
      const res = { sendStatus: sinon.stub().returnsThis() };
      const db = {};
      let result = await handler(req, res, db);
      assert.equal(result.sendStatus.args[0], 415);
    });
    it("responds (401 Unauthorized) if id_token property is missing from request", async () => {
      const req = { method:'POST', body: {},
        get: function (field) { assert.equal(field, 'Content-Type'); return "application/json"; } 
      };
      const res = { status: sinon.stub().returnsThis(), send: sinon.stub().returnsThis() };
      const db = {};
      let result = await handler(req, res, db);
      assert.equal(result.status.args[0],401);
      assert.equal(result.send.args[0],"no id_token provided");
            
    });
    it("responds (401 Unauthorized) if id_token in request is unparseable", () => {});
    it("responds (401 Unauthorized) if id_token in request is expired", () => {
      clock = sinon.useFakeTimers(1546305800000); // Jan 1, 2019 01:23:20 UTC
    });
    it("responds (401 Unauthorized) if id_token in request is unverifiable", () => {
      clock = sinon.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 UTC
    });
    it("responds (403 Forbidden) if id_token in request is verified but audience isn't this app", () => {
      clock = sinon.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 UTC
    });
    it("responds (200 OK) with a new firebase token if id_token in request is verified", () => {
      clock = sinon.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 UTC
    });  
  });
});