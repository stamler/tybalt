
const chai = require('chai');
const assert = chai.assert;

describe("utilities module", () => {
  const utilitiesModule = require('../utilities.js')
  describe("filterProperties()", () => {
    // Test setup for filterProperties() in utilities.js
    const data = { taste:null, fruit: "apple", vegetable: "carrot", mineral: null };
    const validProps = ["fruit", "vegetable", "mineral"];
    const requiredProps = ["vegetable"];
    const filterProperties = utilitiesModule.filterProperties;
    it("returns empty object if no options are provided", () => {
      const expected = {};
      return assert.deepEqual(filterProperties(data), expected);
    });
    it("keeps all valid properties with default args", () => {
      const options = { valid: validProps }
      const expected = {fruit: "apple", vegetable: "carrot", mineral: null};
      return assert.deepEqual(filterProperties(data, options), expected);
    });
    it("strips valid null properties if stripValidNulls is true", () => {
      const options = {valid: validProps, stripValidNulls: true};
      const expected = {fruit: "apple", vegetable: "carrot"};
      return assert.deepEqual(filterProperties(data, options), expected);
    });
    it("keeps required properties though valid properties aren't given", () => {
      const options = {required: requiredProps};
      const expected = {vegetable: "carrot"};
      return assert.deepEqual(filterProperties(data, options), expected);
    });
    it("fails if required value(s) are null while allowAndAddRequiredNulls is false", () => {
      const options = {required:["taste", "fruit"], allowAndAddRequiredNulls: false };
      // first arg of throws() must be function, so wrap it with params
      const wrapped = function() { filterProperties(data, options) };
      return assert.throws(wrapped, Error);
    });
    it("fails if required value(s) are missing while allowAndAddRequiredNulls is false", () => {
      const options = {required:["taste", "fruit", "extra"], allowAndAddRequiredNulls: false };
      // first arg of throws() must be function, so wrap it with params
      const wrapped = function() { filterProperties(data, options) };
      return assert.throws(wrapped, Error);
    });
    it("keeps required null properties by default", () => {
      const options = {required:["taste", "fruit"]};
      const expected = {taste: null, fruit:"apple"};
      return assert.deepEqual(filterProperties(data, options), expected);
    });
    it("adds missing required properties as null if allowAndAddRequiredNulls is true", () => {
      const options = {required:["taste", "fruit", "extra"], allowAndAddRequiredNulls:true};
      const expected = {taste: null, fruit:"apple", "extra":null};
      return assert.deepEqual(filterProperties(data, options), expected);
    });
    it("strips valid null properties while adding required null properties", () => {
      const options = {valid: validProps, required: ["vegetable", "taste", "extra"], stripValidNulls: true, allowAndAddRequiredNulls:true};
      const expected = {fruit:"apple", vegetable:"carrot", taste:null, extra:null}
      return assert.deepEqual(filterProperties(data, options), expected);
    });
  });
  describe("makeSlug()", () => {
    // Test setup for makeSlug() in utilities.js
    const makeSlug = utilitiesModule.makeSlug;
    it("makes a slug from serial number and manufactuer strings", () => {
      assert.strictEqual(makeSlug(" QKF3421 "," Smell Computer, Corporation, Inc.   "), "QKF3421,smell_computer_corporation");
      assert.strictEqual(makeSlug(" QK F3421 ","Award Software International, Inc."), "QKF3421,award_software_international");
      assert.strictEqual(makeSlug(" QKF34 21 ","Phoenix Techno, LTD"), "QKF3421,phoenix_techno");
      assert.strictEqual(makeSlug(" Q-KF3421 ","Dell Inc.  "), "Q-KF3421,dell");
      assert.strictEqual(makeSlug("QKF34,21","Dell Inc.     "), "QKF3421,dell");
    });
  });
})