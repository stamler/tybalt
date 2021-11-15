import { admin, projectId } from "./index.test";
import * as chai from "chai";    
import * as chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);

import "mocha";

const assert = chai.assert;

import * as sinon from "sinon";
import { cleanupFirestore } from "./helpers";
const shared = require("./shared.helpers.test.js");
import * as test from "firebase-functions-test";
const functionsTest = test();

functionsTest.mockConfig({ tybalt: { radiator: { secret: "asdf" } } });

import { handler } from "../src/rawLogins";

describe("rawLogins module", () => {
  const db = admin.firestore();
  const Req = shared.makeReqObject; // Stub request object
  const Res = shared.makeResObject; // Stub response object

  async function resultAsExpected(result: any) {
    // verify the response was 202
    assert.equal(result.status.args[0][0], 202);

    // verify only one computer exists and that the serial matches
    const computers = await db.collection("Computers").get();
    assert.equal(computers.size, 1);
    assert.equal(computers.docs[0].get("serial"), expected.serial);
    assert.equal(computers.docs[0].get("osSku"), expected.osSku);

    // verify only one user exists and that the email matches
    const users = await db.collection("Users").get();
    assert.equal(users.size, 1);
    assert.equal(users.docs[0].get("email"), expected.email);
    assert.equal(users.docs[0].get("lastComputer"), "SN123,manufac");

    // verify only one login exists and that the userSourceAnchor matches
    const logins = await db.collection("Logins").get()
    assert.equal(logins.size, 1);
    assert.equal(logins.docs[0].get("userSourceAnchor"), expected.userSourceAnchor);
    
    return;
  }
  // Use object rather than string for body since requests w/ JSON Content-Type
  // are parsed with a JSON body parser in express / firebase functions.
  const data = {
    upn: "TTesterson@testco.co",
    email: "TTesterson@testco.co",
    serial: "SN123",
    mfg: "manufac",
    userSourceAnchor: "f25d2a25f25d2a25f25d2a25f25d2a25",
    networkConfig: { "DC:4A:3E:E0:45:00": {} },
    radiatorVersion: 7,
    systemType: " 5.",
    osSku: "48",
    computerName: "Tromsø",
    userGivenName: "Testy",
    userSurname: "Testerson",
  };
  const expected = {
    upn: "ttesterson@testco.co",
    email: "ttesterson@testco.co",
    serial: "SN123",
    mfg: "manufac",
    userSourceAnchor: "f25d2a25f25d2a25f25d2a25f25d2a25",
    networkConfig: { "DC:4A:3E:E0:45:00": {} },
    radiatorVersion: 7,
    systemType: 5,
    osSku: 48,
    computerName: "Tromsø",
    userGivenName: "Testy",
    userSurname: "Testerson",
  };
/*
  const userObjArg = {
    givenName: undefined,
    surname: undefined,
    upn: "ttesterson@testco.co",
    email: "ttesterson@testco.co",
    lastComputer: "SN123,manufac",
    userSourceAnchor: "f25d2a25f25d2a25f25d2a25f25d2a25",
  };
  const loginObjArg = {
    computer: "SN123,manufac",
    givenName: undefined,
    surname: undefined,
    userSourceAnchor: "f25d2a25f25d2a25f25d2a25f25d2a25",
  };
*/
  describe("handler() responses", async () => {
    let sandbox: sinon.SinonSandbox;

    // eslint-disable-next-line prefer-arrow-callback
    beforeEach("reset data", async function () {
      functionsTest.mockConfig({ tybalt: { radiator: { secret: "asdf" } } });
      await cleanupFirestore(projectId);
      sandbox = sinon.createSandbox();
    });

    // eslint-disable-next-line prefer-arrow-callback
    afterEach(function () {
      sandbox.restore();
    });

    it("(401 Unauthorized) if request header doesn't include the env secret", async () => {
      const constub = sandbox.stub(console, "log");
      let result = await handler(Req({ body: { ...data } }), Res());
      sinon.assert.calledOnce(constub);
      assert.equal(result.status.args[0][0], 401);
    });
    it("(202 Accepted) if request header doesn't include the env secret and environment variable isn't set", async () => {
      functionsTest.mockConfig({ tybalt: { radiator: { } } });
      let result = await handler(Req({ body: { ...data } }), Res());      
      assert.equal(result.status.args[0][0], 202);
    });
    it("(405 Method Not Allowed) if request method isn't POST", async () => {
      let result = await handler(
        Req({ method: "GET", authType: "TYBALT", token: "asdf" }),
        Res()
      );
      assert.deepEqual(result.header.args[0], ["Allow", "POST"]);
      assert.equal(result.status.args[0][0], 405);
    });
    it("(415 Unsupported Media Type) if Content-Type isn't application/json", async () => {
      let result = await handler(
        Req({ contentType: "not/json", authType: "TYBALT", token: "asdf" }),
        Res()
      );
      assert.equal(result.status.args[0][0], 415);
    });
    it("(400 Bad Request) if an empty JSON login is POSTed", async () => {
      let result = await handler(
        Req({ body: {}, authType: "TYBALT", token: "asdf" }),
        Res()
      );
      assert.equal(result.status.args[0][0], 400);
    });
    it("(202 Accepted) if a valid JSON login is POSTed, neither computer nor user exists", async () => {
      resultAsExpected( await handler(
        Req({ body: { ...data }, authType: "TYBALT", token: "asdf" }),
        Res()
      ));
    });
    it("(202 Accepted) if a valid JSON login is POSTed, user exists", async () => {
      await db.collection("Users").add({ givenName: data.userGivenName, lastComputer: "SN325,hp", surname: data.userSurname, updated: new Date(), upn: data.upn, userSourceAnchor: data.userSourceAnchor });
      resultAsExpected( await handler(
        Req({ body: { ...data }, authType: "TYBALT", token: "asdf" }),
        Res()
      ));
    });
    it("(202 Accepted) if a valid JSON login is POSTed, computer exists", async () => {
      await db.collection("Computers").add({ serial: data.serial, computerName: data.computerName, mfg: data.mfg, osSku: 69, systemType: data.systemType, networkConfig: data.networkConfig });
      resultAsExpected( await handler(
        Req({ body: { ...data }, authType: "TYBALT", token: "asdf" }),
        Res()
      ));
    });
    it("(202 Accepted) if a valid JSON login is POSTed, both computer and user exist", async () => {
      await db.collection("Users").add({ givenName: data.userGivenName, lastComputer: "SN325,hp", surname: data.userSurname, updated: new Date(), upn: data.upn, userSourceAnchor: data.userSourceAnchor });
      await db.collection("Computers").add({ serial: data.serial, computerName: data.computerName, mfg: data.mfg, osSku: 69, systemType: data.systemType, networkConfig: data.networkConfig });
      resultAsExpected( await handler(
        Req({ body: { ...data }, authType: "TYBALT", token: "asdf" }),
        Res()
      ));
    });
    it("(202 Accepted) if a valid JSON login is POSTed, computer exists, multiple users match", async () => {
      let result = await handler(
        Req({ body: { ...data }, authType: "TYBALT", token: "asdf" }),
        Res()
      );
      assert.equal(result.status.args[0][0], 202);

      // TODO:
      // assert batch.set() WASN'T CALLED with args for user
      // assert batch.set() was called once with args for login
      // assert batch.set() was called once with args for data
      // assert batch.commit() was called once
    });
    it("(202 Accepted) if an invalid JSON login is POSTed", async () => {
      const constub = sandbox.stub(console, "log");
      let result = await handler(
        Req({
          body: { ...data, networkConfig: {} },
          authType: "TYBALT",
          token: "asdf",
        }),
        Res()
      );
      sinon.assert.calledTwice(constub);
      assert.equal(result.status.args[0][0], 202);
      // assert set() was called once with args {} outside of batch
      // confirm RawLogin
      // assert batch.set() wasn't called
      // assert batch.commit() wasn't called
    });
    it("(500 Internal Server Error) if database write fails", async () => {
      const constub = sandbox.stub(console, "log");
      let result = await handler(
        Req({ body: { ...data }, authType: "TYBALT", token: "asdf" }),
        Res()
      );
      constub.calledWith("commit to firestore failed");
      assert.equal(result.status.args[0][0], 500);
    });
  });
  describe("removeIfFails keyword", () => {
    it("strips the empty email property and accepts as valid from an otherwise valid login", async () => {
      let result = await handler(
        Req({
          body: { ...data, email: "" },
          authType: "TYBALT",
          token: "asdf",
        }),
        Res()
      );
      assert.equal(result.status.args[0][0], 202);
      /*
      const { email: _, ...expectedNoEmail } = expected;
      const { email: _2, ...userNoEmail } = userObjArg;
      assert.deepEqual(sts(db.batchStubs.set.args[0][1]), expectedNoEmail); // batch.set() called with computer
      assert.deepEqual(sts(db.batchStubs.set.args[1][1]), userNoEmail); // batch.set() called with user
      assert.deepEqual(sts(db.batchStubs.set.args[2][1]), loginObjArg); // batch.set() was called with login
      sinon.assert.calledOnce(db.batchStubs.commit);
      */
    });
  });
});
