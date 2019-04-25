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
  
    it("rejects if the user doesn't have the admin claim (role)", async () => {
      const error = new functions.https.HttpsError("unauthenticated",
      "Caller must be authenticated");
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
    it("rejects if the user isn't authenticated", async () => {
      const result = claimsToProfiles(undefined, {}, db);
      return assert.isRejected(result,/Caller must be authenticated/)
    });
    it("copies all customClaims from auth users to respective profiles", async () => {
      const result = await claimsToProfiles({}, contextWithAdminClaim, db);
      // verify args sent to batch.set()
      assert.deepEqual(sts(db.batchStubs.set.args[0][1]), {roles: {admin: true, standard: true}}); 
      assert.deepEqual(sts(db.batchStubs.set.args[0][2]), {merge: true});
        
      sinon.assert.calledOnce(db.batchStubs.commit); // batch.commit() called ?

    });
    it("properly iterates over large collections");
    it("reports if one or more batch commits fail");
    it("creates profiles if they don't exist for all auth users");
  });

  describe("claimsHandler()", () => {
    const claimsHandler = require('../claims.js').claimsHandler;

    it("reports if request object is invalid");
  });
});