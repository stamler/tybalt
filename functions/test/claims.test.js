const chai = require('chai')
chai.use(require('chai-as-promised'))
const assert = chai.assert;
const functions = require('firebase-functions');
const sinon = require('sinon');
const shared = require('./shared.helpers.test');

describe("claims module", () => {

  const sandbox = sinon.createSandbox();
  const makeAuthStub = shared.makeAuthStub; // Stub admin.auth()

  // stub out admin.auth().listUsers()
  const admin = require('firebase-admin');
  sandbox.stub(admin, 'auth').get( makeAuthStub() );

  // TODO: use makeAuthStub from azure.test.data.js 
  
  describe("claimsToProfiles()", () => {
    const claimsToProfiles = require('../claims.js').claimsToProfiles;
    const contextWithAdminClaim = {auth: { token: { customClaims: {admin: true}}}};
    const context = {auth: { token: { customClaims: {}}}};

    it("rejects if the user doesn't have the admin claim (role)", async () => {
      const error = new functions.https.HttpsError("unauthenticated",
      "Caller must be authenticated");
      const result = claimsToProfiles({}, context);
      return assert.isRejected(result, /Caller must have admin role/);
    });
    it("rejects if data argument is a non-empty object", async () => {
      const result = claimsToProfiles({non: "empty"}, contextWithAdminClaim);
      return assert.isRejected(result, /No arguments are to be provided for this callable function/);
    });
    it("rejects if data argument is not an object", async () => {
      const result = claimsToProfiles(null, contextWithAdminClaim);
      return assert.isRejected(result, /No arguments are to be provided for this callable function/);
    });
    it("rejects if the user isn't authenticated", async () => {
      const result = claimsToProfiles(undefined, {});
      return assert.isRejected(result,/Caller must be authenticated/)
    });
    it("reports if one or more batch commits fail", async () => {
      const result = claimsToProfiles({}, contextWithAdminClaim);
    });
    it("copies all customClaims from auth users to respective profiles");
    it("creates profiles if they don't exist for all auth users");
  });

  describe("claimsHandler()", () => {
    const claimsHandler = require('../claims.js').claimsHandler;

    it("reports if request object is invalid");
  });
});