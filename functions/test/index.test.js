
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
    it("adds missing required properties as null if addRequiredNulls is true", () => {
      const options = {required:["taste", "fruit", "extra"], addRequiredNulls:true};
      const expected = {taste: null, fruit:"apple", "extra":null};
      return assert.deepEqual(filterProperties(data, options), expected);
    });
    it("strips valid null properties while adding required null properties", () => {
      const options = {valid: validProps, required: ["vegetable", "taste", "extra"], stripValidNulls: true, addRequiredNulls:true};
      const expected = {fruit:"apple", vegetable:"carrot", taste:null, extra:null}
      return assert.deepEqual(filterProperties(data, options), expected);
    });
  });
  describe("makeSlug()", () => {
    // Test setup for makeSlug() in utilities.js
    const makeSlug = utilitiesModule.makeSlug;
    it("makes a slug from a serial number and manufactuer string", () => {
      // TODO: write several tests with different input values
    });
  });    
})