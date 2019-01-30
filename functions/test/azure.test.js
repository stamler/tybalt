const assert = require('chai').assert;
const jwt = require('jsonwebtoken');
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');
const azureModule = require('../azure.js');

describe("azure module", () => {
  // Keypair generated at https://8gwifi.org/jwkfunctions.jsp
  // Reference set from Microsoft https://login.microsoftonline.com/common/discovery/keys
  const key = fs.readFileSync(path.join(__dirname, 'key.pem'), 'ascii');
  const certificates = {'1234': fs.readFileSync(path.join(__dirname, 'cert.pem'), 'ascii') };
  const jwk_cert = JSON.parse(fs.readFileSync(path.join(__dirname, 'jwk.json')));
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
      let result = await handler(makeReqObject("fhqwhgads"), makeResObject(), certificates);
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args.toString(),"Error: Can't decode the token");
    });
    it("05 responds (401 Unauthorized) if matching certificate for id_token cannot be found", async () => {
      let result = await handler(makeReqObject(id_token), makeResObject());
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args.toString(),"Error: Can't find the token's certificate");
    });
    it("06 responds (401 Unauthorized) if id_token in request fails jwt.verify()", async () => {
      clock = sinon.useFakeTimers(1546305800000); // Jan 1, 2019 01:23:20 UTC
      let result = await handler(makeReqObject(id_token), makeResObject(), certificates);
      assert.equal(result.status.args[0][0],401);
      assert.equal(result.send.args.toString(),"TokenExpiredError: jwt expired");
      // TODO: assert that the body of the result is not a token
    });
    it("07 responds (403 Forbidden) if id_token in request is verified but audience isn't this app", async () => {
      clock = sinon.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 UTC
      let result = await handler(makeReqObject(id_token), makeResObject(), certificates);
      // TODO: create a new testing id_token that has a different audience claim
      assert.equal(result.status.args[0][0],403);
    });
    it("08 responds (200 OK) with a new firebase token if id_token in request is verified", () => {
      clock = sinon.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 UTC
      assert.equal(true, false);
    });  
  });
});