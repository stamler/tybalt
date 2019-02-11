const chai = require('chai')
const chaiAsPromised = require('chai-as-promised');
const assert = chai.assert;
chai.use(chaiAsPromised)

const sinon = require('sinon');
const shared = require('./shared.helpers.test.js');

describe("rawLogins module", () => {
  const db = shared.makeFirestoreStub;

  // It's OK to use an object rather than string for body here since Req
  // objects that are received in Firebase (like Express) with Content-Type
  // set to JSON are parsed with a JSON body parser.
  const data = {upn: "TTesterson@testco.co" , email: "TTesterson@testco.co", serial:"SN123", mfg:"manufac", userSourceAnchor:"f25d2a25", networkConfig:{}};
  describe("handler() responses", () => {
    const Req = shared.makeReqObject; // Stub request object
    const Res = shared.makeResObject; // Stub response object

    it("(405 Method Not Allowed) if request method isn't POST", async () => {
      handler = require('../rawLogins.js').handler;
      let result = await handler(Req({method:'GET'}), Res(), db());      
      assert.deepEqual(result.header.args[0], ['Allow','POST']);
      assert.equal(result.status.args[0][0],405);
    });
    it("(415 Unsupported Media Type) if Content-Type isn't application/json", async () => {
      handler = require('../rawLogins.js').handler;
      let result = await handler(Req({contentType:'not/json'}), Res(), db());
      assert.equal(result.status.args[0][0], 415);
    });
    it("(202 Accepted) if a valid JSON login is POSTed", async () => {
      handler = require('../rawLogins.js').handler;
      let result = await handler(Req({body: data}),Res(), db());
      assert.equal(result.status.args[0][0], 202);
      // assert set() was called once with args data
    });
    it("(202 Accepted) if a valid JSON login is POSTed", async () => {
      handler = require('../rawLogins.js').handler;
      let result = await handler(Req({body: data}),Res(), db({exists: false}));
      assert.equal(result.status.args[0][0], 202);
      // assert set() was called once with args data
    });
    it("(202 Accepted) if an invalid JSON login is POSTed", async () => {
      handler = require('../rawLogins.js').handler;
      let result = await handler(Req({body: {}}),Res(), db());
      assert.equal(result.status.args[0][0], 202);
      // assert add() was called once with args {} 
    });
    it("(500 Internal Server Error) if database write fails", async () => {
      handler = require('../rawLogins.js').handler;
      let result = await handler(Req({body: {}}),Res(), db({writeFail: true}));
      assert.equal(result.status.args[0][0], 500);
    });
  });
  describe("handler() firebase I/O", () => {
    // TODO: stub batch.set() batch.update(), spy batch.commit(), db
  });
});