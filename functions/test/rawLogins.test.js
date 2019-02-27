const chai = require('chai')
const chaiAsPromised = require('chai-as-promised');
const assert = chai.assert;
chai.use(chaiAsPromised)

const sinon = require('sinon');
const shared = require('./shared.helpers.test.js');
const functions = require('firebase-functions');

describe("rawLogins module", () => {
  const makeDb = shared.makeFirestoreStub;
  const Req = shared.makeReqObject; // Stub request object
  const Res = shared.makeResObject; // Stub response object

  const handler = require('../rawLogins.js').handler;

  // Use object rather than string for body since requests w/ JSON Content-Type
  // are parsed with a JSON body parser in express / firebase functions.
  const data = {upn: "TTesterson@testco.co" , email: "TTesterson@testco.co", serial:"SN123", mfg:"manufac", userSourceAnchor:"f25d2a25f25d2a25f25d2a25f25d2a25", networkConfig:{ "DC:4A:3E:E0:45:00": {} }, radiatorVersion: 7, systemType:" 5.", osSku:"48", computerName:"Tromsø" };
  const expected = {upn: "TTesterson@testco.co" , email: "TTesterson@testco.co", serial:"SN123", mfg:"manufac", userSourceAnchor:"f25d2a25f25d2a25f25d2a25f25d2a25", networkConfig:{ "DC:4A:3E:E0:45:00": {} }, radiatorVersion: 7, systemType:5, osSku:48, computerName:"Tromsø" };

  const sts = shared.stripTimestamps; // utility function to strip timestamp props
  const userObjArg = { givenName: undefined, surname: undefined, upn: "ttesterson@testco.co" , email: "ttesterson@testco.co", lastComputer:"SN123,manufac", userSourceAnchor:"f25d2a25f25d2a25f25d2a25f25d2a25" };
  const loginObjArg = {computer: "SN123,manufac", givenName: undefined, surname: undefined, userSourceAnchor: "f25d2a25f25d2a25f25d2a25f25d2a25" };

  describe("handler() responses", () => {
    let sandbox;

    // eslint-disable-next-line prefer-arrow-callback
    beforeEach( function () {
      sandbox = sinon.createSandbox();
      sandbox.stub(functions, 'config').returns({tybalt: {radiator: {secret:'asdf'}}});    
    });

    // eslint-disable-next-line prefer-arrow-callback
    afterEach( function () {
      sandbox.restore();
    });

    it("(401 Unauthorized) if request header doesn't include the env secret", async () => {
      const db = makeDb();
      let result = await handler(Req({body: {...data}}),Res(), db);
      assert.equal(result.status.args[0][0], 401);
    });
    it("(202 Accepted) if request header doesn't include the env secret and environment variable isn't set", async () => {
      const db = makeDb();
      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(functions, 'config').returns({tybalt:{ radiator: {}}});
      let result = await handler(Req({body: {...data}}),Res(), db);
      assert.equal(result.status.args[0][0], 202);
    });
    it("(405 Method Not Allowed) if request method isn't POST", async () => {
      let result = await handler(Req({method:'GET', authType:'TYBALT', token:'asdf'}), Res(), makeDb());      
      assert.deepEqual(result.header.args[0], ['Allow','POST']);
      assert.equal(result.status.args[0][0],405);
    });
    it("(415 Unsupported Media Type) if Content-Type isn't application/json", async () => {
      let result = await handler(Req({contentType:'not/json', authType:'TYBALT', token:'asdf'}), Res(), makeDb());
      assert.equal(result.status.args[0][0], 415);
    });
    it("(202 Accepted) if a valid JSON login is POSTed, neither computer nor user exists", async () => {
      const db = makeDb();
      let result = await handler(Req({body: {...data}, authType:'TYBALT', token:'asdf'}),Res(), db);
      assert.equal(result.status.args[0][0], 202);
      assert.deepEqual(sts(db.batchStubs.set.args[0][1]), expected); // batch.set() called with computer
      assert.deepEqual(sts(db.batchStubs.set.args[1][1]), userObjArg); // batch.set() called with user
      assert.deepEqual(sts(db.batchStubs.set.args[2][1]), loginObjArg); // batch.set() was called with login
      sinon.assert.calledOnce(db.batchStubs.commit);
    });
    it("(202 Accepted) if a valid JSON login is POSTed, user exists", async () => {
      const db = makeDb({userMatches: 1});
      let result = await handler(Req({body: {...data}, authType:'TYBALT', token:'asdf'}),Res(), db);
      assert.equal(result.status.args[0][0], 202);
      assert.deepEqual(sts(db.batchStubs.set.args[0][1]), expected); // batch.set() called with computer
      assert.deepEqual(sts(db.batchStubs.set.args[1][1]), userObjArg); // batch.set() called with user
      assert.deepEqual(sts(db.batchStubs.set.args[2][1]), loginObjArg); // batch.set() was called with login
      sinon.assert.calledOnce(db.batchStubs.commit);
    });
    it("(202 Accepted) if a valid JSON login is POSTed, computer exists", async () => {
      const db = makeDb({computerExists: true});
      let result = await handler(Req({body: {...data}, authType:'TYBALT', token:'asdf'}),Res(), db);
      assert.equal(result.status.args[0][0], 202);
      assert.deepEqual(sts(db.batchStubs.set.args[0][1]), expected); // batch.set() called with computer
      assert.deepEqual(sts(db.batchStubs.set.args[1][1]), userObjArg); // batch.set() called with user
      assert.deepEqual(sts(db.batchStubs.set.args[2][1]), loginObjArg); // batch.set() was called with login
      sinon.assert.calledOnce(db.batchStubs.commit);
    });
    it("(202 Accepted) if a valid JSON login is POSTed, both computer and user exist", async () => {
      const db = makeDb({computerExists: true, userMatches: 1});
      let result = await handler(Req({body: {...data}, authType:'TYBALT', token:'asdf'}),Res(), db);
      assert.equal(result.status.args[0][0], 202);
      assert.deepEqual(sts(db.batchStubs.set.args[0][1]), expected); // batch.set() called with computer
      assert.deepEqual(sts(db.batchStubs.set.args[1][1]), userObjArg); // batch.set() called with user
      assert.deepEqual(sts(db.batchStubs.set.args[2][1]), loginObjArg); // batch.set() was called with login
      sinon.assert.calledOnce(db.batchStubs.commit);
    });
    it("(202 Accepted) if a valid JSON login is POSTed, computer exists, multiple users match", async () => {
      const db = makeDb({computerExists: true, userMatches: 2});
      let result = await handler(Req({body: {...data}, authType:'TYBALT', token:'asdf'}),Res(), db);
      assert.equal(result.status.args[0][0], 202);
      // assert batch.set() WASN'T CALLED with args for user
      // assert batch.set() was called once with args for login
      // assert batch.set() was called once with args for data
      // assert batch.commit() was called once
    });
    it("(202 Accepted) if an invalid JSON login is POSTed", async () => {
      let result = await handler(Req({body: { ...data, networkConfig:{}}, authType:'TYBALT', token:'asdf'}),Res(), makeDb());
      assert.equal(result.status.args[0][0], 202);
      // assert set() was called once with args {} outside of batch
      // confirm RawLogin
      // assert batch.set() wasn't called
      // assert batch.commit() wasn't called
    });
    it("(500 Internal Server Error) if database write fails", async () => {
      const db = makeDb({writeFail: true});
      let result = await handler(Req({body: {...data}, authType:'TYBALT', token:'asdf'}),Res(), db);
      assert.equal(result.status.args[0][0], 500);
    });
  });
  describe("removeIfFails keyword", () => {
    let sandbox;
    
    // eslint-disable-next-line prefer-arrow-callback
    beforeEach( function () {
      sandbox = sinon.createSandbox();
      sandbox.stub(functions, 'config').returns({tybalt: {radiator: {secret:'asdf'}}});    
    });

    // eslint-disable-next-line prefer-arrow-callback
    afterEach( function () {
      sandbox.restore();
    });

    it("strips the empty email property and accepts as valid from an otherwise valid login", async () => {
      const db = makeDb();
      let result = await handler(Req({body: {...data, email:''}, authType:'TYBALT', token:'asdf'}),Res(), db);
      assert.equal(result.status.args[0][0], 202);
      const { email:_, ...expectedNoEmail } = expected;
      const { email:_2, ...userNoEmail } = userObjArg;
      assert.deepEqual(sts(db.batchStubs.set.args[0][1]), expectedNoEmail); // batch.set() called with computer
      assert.deepEqual(sts(db.batchStubs.set.args[1][1]), userNoEmail); // batch.set() called with user
      assert.deepEqual(sts(db.batchStubs.set.args[2][1]), loginObjArg); // batch.set() was called with login
      sinon.assert.calledOnce(db.batchStubs.commit);
    });
  });
});