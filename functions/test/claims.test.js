const chai = require('chai')

describe("claims module", () => {

  // TODO: stub out admin.auth().listUsers()
  // TODO: use makeAuthStub from azure.test.data.js 
  
  describe("claimsToProfiles()", () => {
    const claimsToProfiles = require('../claims.js').claimsToProfiles;
    it("rejects if the user doesn't have the admin claim (role)");
    it("rejects if data argument isn't an empty object");
    it("rejects if the user isn't authenticated");
    it("reports if one or more batche commits fail");
    it("copies all customClaims from auth users to respective profiles");
    it("creates profiles if they don't exist for all auth users");
  });
});