const chai = require("chai");
chai.use(require("chai-as-promised"));
const assert = chai.assert;

const sinon = require("sinon");
const shared = require("./shared.helpers.test");

describe("computers module", () => {
  const admin = require("firebase-admin");
  const makeAuthStub = shared.makeAuthStub; // Stub admin.auth()
  const makeDb = shared.makeFirestoreStub; // Stub admin.firestore()
  const sandbox = sinon.createSandbox();

  let db;
  // eslint-disable-next-line prefer-arrow-callback
  beforeEach(function () {
    db = makeDb();
    sandbox.stub(admin, "auth").get(makeAuthStub());
  });

  // eslint-disable-next-line prefer-arrow-callback
  afterEach(function () {
    sandbox.restore();
  });

  describe("assignComputerToUser()", () => {
    const assignComputerToUser = require("../computers.js")
      .assignComputerToUser;
    it("rejects if the user isn't authenticated", async () => {
      const result = assignComputerToUser(undefined, {}, db);
      return assert.isRejected(result, /Caller must be authenticated/);
    });
  });
});
