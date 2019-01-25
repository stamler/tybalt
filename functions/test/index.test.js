
const chai = require('chai');
const assert = chai.assert;

// https://firebase.google.com/docs/functions/unit-testing
// const test = require('firebase-functions-test')(); // offline-only, no args

describe("utilities module", () => {
  const utilitiesModule = require('../utilities.js')
  describe("filterProperties()", () => {
    // Test setup for filterProperties() in rawLogins.js
    const data = { smell:"pungent", taste:null, fruit: "apple", vegetable: "carrot", mineral: null };
    const validProps = ["fruit", "vegetable", "mineral"];
    const requiredProps = ["vegetable"];
    const filterProperties = utilitiesModule.filterProperties
    it("strips everything if no args beyond data are specified", () => {
      const expected = {};
      return assert.deepEqual(filterProperties(data), expected);
    });
    it("keeps all valid properties with default args", () => {
      const options = { valid: validProps }
      const expected = {fruit: "apple", vegetable: "carrot", mineral: null};
      return assert.deepEqual(filterProperties(data, options), expected);
    });
    it("strips valid null properties with keepValidNulls = false", () => {
      const options = {valid: validProps, keepValidNulls: false};
      const expected = {fruit: "apple", vegetable: "carrot"};
      return assert.deepEqual(filterProperties(data, options), expected);
    });
    it("keeps required properties even if valid isn't specified", () => {
      const options = {required: requiredProps};
      const expected = {vegetable: "carrot"};
      return assert.deepEqual(filterProperties(data, options), expected);
    });
    it("fails by default when required properties have null values", () => {
      const options = {required:["taste", "apple"]};
      // first arg of throws() must be function, so wrap it with params
      const wrapped = function() { filterProperties(data, options) };
      return assert.throws(wrapped, Error);
    });
    it("", () => {});
    it("", () => {});
    it("", () => {});
  })    
})