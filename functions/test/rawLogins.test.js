const chai = require('chai')
const chaiAsPromised = require('chai-as-promised');
const assert = chai.assert;
chai.use(chaiAsPromised)

const sinon = require('sinon');
const shared = require('./shared.helpers.test.js');

describe("rawLogins module", () => {
  const makeDb = shared.makeFirestoreStub;

  // It's OK to use an object rather than string for body here since Req
  // objects that are received in Firebase (like Express) with Content-Type
  // set to JSON are parsed with a JSON body parser.
  const data = {upn: "TTesterson@testco.co" , email: "TTesterson@testco.co", serial:"SN123", mfg:"manufac", userSourceAnchor:"f25d2a25f25d2a25f25d2a25f25d2a25", networkConfig:{}, radiatorVersion: 7 };
  describe("handler() responses", () => {
    const Req = shared.makeReqObject; // Stub request object
    const Res = shared.makeResObject; // Stub response object
    const sts = shared.stripTimestamps; // utility function to strip timestamp props
    const userObjArg = { givenName: undefined, surname: undefined, upn: "ttesterson@testco.co" , email: "ttesterson@testco.co", lastComputer:"SN123,manufac", userSourceAnchor:"f25d2a25f25d2a25f25d2a25f25d2a25" };
    const loginObjArg = {computer: "SN123,manufac", givenName: undefined, surname: undefined, userSourceAnchor: "f25d2a25f25d2a25f25d2a25f25d2a25" };

    it("(405 Method Not Allowed) if request method isn't POST", async () => {
      handler = require('../rawLogins.js').handler;
      let result = await handler(Req({method:'GET'}), Res(), makeDb());      
      assert.deepEqual(result.header.args[0], ['Allow','POST']);
      assert.equal(result.status.args[0][0],405);
    });
    it("(415 Unsupported Media Type) if Content-Type isn't application/json", async () => {
      handler = require('../rawLogins.js').handler;
      let result = await handler(Req({contentType:'not/json'}), Res(), makeDb());
      assert.equal(result.status.args[0][0], 415);
    });
    it("(202 Accepted) if a valid JSON login is POSTed, neither computer nor user exists", async () => {
      handler = require('../rawLogins.js').handler;
      const db = makeDb();
      let result = await handler(Req({body: {...data}}),Res(), db);
      assert.equal(result.status.args[0][0], 202);
      assert.deepEqual(sts(db.batchStubs.set.args[0][1]), data); // batch.set() called with computer
      assert.deepEqual(sts(db.batchStubs.set.args[1][1]), userObjArg); // batch.set() called with user
      assert.deepEqual(sts(db.batchStubs.set.args[2][1]), loginObjArg); // batch.set() was called with login
      sinon.assert.calledOnce(db.batchStubs.commit);
    });
    it("(202 Accepted) if a valid JSON login is POSTed, user exists", async () => {
      handler = require('../rawLogins.js').handler;
      const db = makeDb({userMatches: 1});
      let result = await handler(Req({body: {...data}}),Res(), db);
      assert.equal(result.status.args[0][0], 202);
      assert.deepEqual(sts(db.batchStubs.set.args[0][1]), data); // batch.set() called with computer
      assert.deepEqual(sts(db.batchStubs.set.args[1][1]), userObjArg); // batch.set() called with user
      assert.deepEqual(sts(db.batchStubs.set.args[2][1]), loginObjArg); // batch.set() was called with login
      sinon.assert.calledOnce(db.batchStubs.commit);
    });
    it("(202 Accepted) if a valid JSON login is POSTed, computer exists", async () => {
      handler = require('../rawLogins.js').handler;
      const db = makeDb({computerExists: true});
      let result = await handler(Req({body: {...data}}),Res(), db);
      assert.equal(result.status.args[0][0], 202);
      assert.deepEqual(sts(db.batchStubs.set.args[0][1]), data); // batch.set() called with computer
      assert.deepEqual(sts(db.batchStubs.set.args[1][1]), userObjArg); // batch.set() called with user
      assert.deepEqual(sts(db.batchStubs.set.args[2][1]), loginObjArg); // batch.set() was called with login
      sinon.assert.calledOnce(db.batchStubs.commit);
    });
    it("(202 Accepted) if a valid JSON login is POSTed, both computer and user exist", async () => {
      handler = require('../rawLogins.js').handler;
      const db = makeDb({computerExists: true, userMatches: 1});
      let result = await handler(Req({body: {...data}}),Res(), db);
      assert.equal(result.status.args[0][0], 202);
      assert.deepEqual(sts(db.batchStubs.set.args[0][1]), data); // batch.set() called with computer
      assert.deepEqual(sts(db.batchStubs.set.args[1][1]), userObjArg); // batch.set() called with user
      assert.deepEqual(sts(db.batchStubs.set.args[2][1]), loginObjArg); // batch.set() was called with login
      sinon.assert.calledOnce(db.batchStubs.commit);
    });
    it("(202 Accepted) if a valid JSON login is POSTed, computer exists, multiple users match", async () => {
      handler = require('../rawLogins.js').handler;
      const db = makeDb({computerExists: true, userMatches: 2});
      let result = await handler(Req({body: {...data}}),Res(), db);
      assert.equal(result.status.args[0][0], 202);
      // assert batch.set() WASN'T CALLED with args for user
      // assert batch.set() was called once with args for login
      // assert batch.set() was called once with args for data
      // assert batch.commit() was called once
    });
    it("(202 Accepted) if an invalid JSON login is POSTed", async () => {
      handler = require('../rawLogins.js').handler;
      let result = await handler(Req({body: {}}),Res(), makeDb());
      assert.equal(result.status.args[0][0], 202);
      // assert set() was called once with args {} outside of batch
      // confirm RawLogin
      // assert batch.set() wasn't called
      // assert batch.commit() wasn't called
    });
    it("(500 Internal Server Error) if database write fails", async () => {
      handler = require('../rawLogins.js').handler;
      const db = makeDb({writeFail: true});
      let result = await handler(Req({body: {...data}}),Res(), db);
      assert.equal(result.status.args[0][0], 500);
    });
  });
});