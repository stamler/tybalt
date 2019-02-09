const chai = require('chai')
const chaiAsPromised = require('chai-as-promised');
const assert = chai.assert;
chai.use(chaiAsPromised)

const sinon = require('sinon');
const shared = require('./shared.helpers.test.js');

describe("rawLogins module", () => {
  describe("handler() responses", () => {
    const Req = shared.makeReqObject; // Stub request object
    const Res = shared.makeResObject; // Stub response object

    it("(405 Method Not Allowed) if request method isn't POST", async () => {
      handler = require('../rawLogins.js').handler;
      let result = await handler(Req({method:'GET'}), Res());      
      assert.deepEqual(result.header.args[0], ['Allow','POST']);
      assert.equal(result.status.args[0][0],405);
    });
    it("(415 Unsupported Media Type) if Content-Type isn't application/json", async () => {
      handler = require('../rawLogins.js').handler;
      let result = await handler(Req({contentType:'not/json'}), Res());
      assert.equal(result.status.args[0][0], 415);
    });
  });
});