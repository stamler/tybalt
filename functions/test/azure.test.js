const assert = require('chai').assert;

// Generate keys here https://mkjwk.org

// TODO: Create a fake "Azure id_token" signed by the generated fake keys then
// use that for testing. Mock the system clock (wtih sinon or nock?) 
// https://github.com/auth0/node-jsonwebtoken/blob/master/test/verify.tests.js#L81

// TODO: stub out getCertificates() for testing the rest of the handler (which is otherwise synchronous)

describe("azure module", () => {
  const azureModule = require('../azure.js');
  const jwt = require('jsonwebtoken');
  const sinon = require('sinon');
  const payload = {};
  const secret = "";

  // declare clock and try to undo sinon's useFakeTimers() after each test
  let clock;
  afterEach(() => { try { clock.restore(); } catch (e) {} }); 

  describe("handler()", () => {
    it("responds (401 Unauthorized) if id_token property is missing from request", () => {});
    it("responds (401 Unauthorized) if id_token in request is unparseable", () => {});
    it("responds (401 Unauthorized) if id_token in request is expired", () => {
      clock = sinon.useFakeTimers(1546305800000); // Jan 1, 2019 01:23:20 GMT
    });
    it("responds (401 Unauthorized) if id_token in request is unverifiable", () => {
      clock = sinon.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 GMT
    });
    it("responds (403 Forbidden) if id_token in request is verified but audience isn't this app", () => {
      clock = sinon.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 GMT
    });
    it("responds (200 OK) with a new firebase token if id_token in request is verified", () => {
      clock = sinon.useFakeTimers(1546300800000); // Jan 1, 2019 00:00:00 GMT
    });  
  });
});