
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
    it("strips everything if no options are provided", () => {
      const expected = {};
      return assert.deepEqual(filterProperties(data), expected);
    });
    it("keeps all valid properties with default args", () => {
      const options = { valid: validProps }
      const expected = {fruit: "apple", vegetable: "carrot", mineral: null};
      return assert.deepEqual(filterProperties(data, options), expected);
    });
    it("strips valid null properties with keepValidNulls is false", () => {
      const options = {valid: validProps, keepValidNulls: false};
      const expected = {fruit: "apple", vegetable: "carrot"};
      return assert.deepEqual(filterProperties(data, options), expected);
    });
    it("keeps required properties though valid properties aren't given", () => {
      const options = {required: requiredProps};
      const expected = {vegetable: "carrot"};
      return assert.deepEqual(filterProperties(data, options), expected);
    });
    it("fails by default when required properties have null values", () => {
      const options = {required:["taste", "fruit"]};
      // first arg of throws() must be function, so wrap it with params
      const wrapped = function() { filterProperties(data, options) };
      return assert.throws(wrapped, Error);
    });
    it("keeps required null properties if allowRequiredNulls is true ", () => {
      const options = {required:["taste", "fruit"], allowRequiredNulls:true};
      const expected = {taste: null, fruit:"apple"};
      return assert.deepEqual(filterProperties(data, options), expected);
    });
    it("creates required null properties if addRequiredNulls is true", () => {
      const options = {required:["taste", "fruit", "extra"], addRequiredNulls:true};
      const expected = {taste: null, fruit:"apple", "extra":null};
      return assert.deepEqual(filterProperties(data, options), expected);
    });
    it("", () => {});
  })    
})