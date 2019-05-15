const assert = require('chai').assert;

describe("utilities module", () => {
  const utilitiesModule = require('../utilities.js')
  describe("makeSlug()", () => {
    // Test setup for makeSlug() in utilities.js
    const makeSlug = utilitiesModule.makeSlug;
    it("makes a slug from serial number and manufactuer strings", () => {
      assert.strictEqual(makeSlug(" QKF3421 "," Smell Computer, Corporation, Inc.   "), "QKF3421,smell_computer_corporation");
      assert.strictEqual(makeSlug(" QK F3421 ","Award Software International, Inc."), "QKF3421,award_software_international");
      assert.strictEqual(makeSlug(" QKF34 21 ","Phoenix Techno, LTD"), "QKF3421,phoenix_techno");
      assert.strictEqual(makeSlug(" Q-KF3421 ","Dell Inc.  "), "Q-KF3421,dell");
      assert.strictEqual(makeSlug("QKF34,21","Dell Inc.     "), "QKF3421,dell");
      assert.strictEqual(makeSlug("QK/F34,21","Dell/Inc.     "), "QKF3421,dell");
    });
    it("throws error if serial or mfg components are too short", () => {
      assert.throws(() => { makeSlug(" P1E  ", " J. inc") }, Error);
    });
  });

  describe("callableIsAuthorized()", () => {
    // Test setup for makeSlug() in utilities.js
    const callableIsAuthorized = utilitiesModule.callableIsAuthorized;
    const ctxAdmin = {auth: { token: { admin: true}}}
    it("returns true if data validates & context has a required claim", () => {
      assert.strictEqual(
        callableIsAuthorized(ctxAdmin,['admin'], true, "test"),
        true
      );
    });
    it("throws if the context isn't authenticated", () => {
      assert.throws(() => {
        callableIsAuthorized({},['admin'], true, "test")
      });
    });
    it("throws if the context doesn't have a matching claim", () => {
      assert.throws(() => {
        callableIsAuthorized(ctxAdmin,['foo'], true, "test")
      });
    });
    it("throws if data doesn't validate", () => {
      assert.throws(() => {
        callableIsAuthorized(ctxAdmin,['admin'], false, "test")
      });
    });
  });
})