const chai = require('chai')
chai.use(require('chai-as-promised'))
const assert = chai.assert;
const functions = require('firebase-functions');
const sinon = require('sinon');
const shared = require('./shared.helpers.test');

describe("claims module", () => {

  const admin = require('firebase-admin');
  const makeAuthStub = shared.makeAuthStub; // Stub admin.auth()
  const makeDb = shared.makeFirestoreStub; // Stub admin.firestore()
  const sandbox = sinon.createSandbox();
  const sts = shared.stripTimestamps; // utility function to strip timestamp props
  const contextWithAdminClaim = {auth: { token: { customClaims: {admin: true}}}};
  const context = {auth: { token: { customClaims: {}}}};
  
  sandbox.stub(admin, 'auth').get( makeAuthStub() );
  
  describe("claimsToProfiles()", () => {
    const claimsToProfiles = require('../claims.js').claimsToProfiles;

    let db;
    // eslint-disable-next-line prefer-arrow-callback
    beforeEach(function() {
      db = makeDb();
    });
  
    it("rejects if the user isn't authenticated", async () => {
      const result = claimsToProfiles(undefined, {}, db);
      return assert.isRejected(result,/Caller must be authenticated/)
    });
    it("rejects if the user doesn't have the admin claim (role)", async () => {
      const result = claimsToProfiles({}, context, db);
      return assert.isRejected(result, /Caller must have admin role/);
    });
    it("rejects if data argument is a non-empty object", async () => {
      const result = claimsToProfiles({non: "empty"}, contextWithAdminClaim, db);
      return assert.isRejected(result, /No arguments are to be provided for this callable function/);
    });
    it("rejects if data argument is not an object", async () => {
      const result = claimsToProfiles(null, contextWithAdminClaim, db);
      return assert.isRejected(result, /No arguments are to be provided for this callable function/);
    });
    it("copies all customClaims from auth users to respective profiles", async () => {
      const result = await claimsToProfiles({}, contextWithAdminClaim, db);
      // verify args sent to batch.set()
      assert.deepEqual(sts(db.batchStubs.set.args[0][1]), {roles: {admin: true, standard: true}}); 
      assert.deepEqual(sts(db.batchStubs.set.args[0][2]), {merge: true});
        
      sinon.assert.calledOnce(db.batchStubs.commit); // batch.commit() called ?

    });
    it("rejects if any batch commits fail", async () => {
      db = makeDb({writeFail: true});
      const result = claimsToProfiles({}, contextWithAdminClaim, db)
      return assert.isRejected(result,/failed to commit custom Claims to Profiles/)

    });
    it("properly iterates over large collections");
    it("creates profiles if they don't exist for all auth users");
  });

  describe("modClaims()", () => {
    const modClaims = require('../claims.js').modClaims;

    let db;
    // eslint-disable-next-line prefer-arrow-callback
    beforeEach(function() {
      db = makeDb();
    });

    it("rejects if the user isn't authenticated", async () => {
      const result = modClaims(undefined, {}, db);
      return assert.isRejected(result,/Caller must be authenticated/)
    });
    it("rejects if the user doesn't have the admin claim (role)", async () => {
      const result = modClaims({}, context, db);
      return assert.isRejected(result, /Caller must have admin role/);
    });
    it("rejects if the data object doesn't validate", async () => {
      const result = modClaims({bogus: "data"}, contextWithAdminClaim, db);
      return assert.isRejected(result, /The provided data failed validation/);
    });
    it("adds a single claim", async () => {
      const data = {
        "action":"add",
        "claims":{ "admin":["user1"] }
      };
      const result = modClaims(data, contextWithAdminClaim, db);


      // THIS TEST PROVES NOTHING YET.
      assert.isFulfilled(result);
    });
    it("adds multiple claims");
    it("removes a single claim");
    it("removes multiple claims");
  });
});