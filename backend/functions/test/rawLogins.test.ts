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
    assert.equal(users.docs[0].get("lastComputer"), expected.lastComputer);

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
    lastComputer: "SN123,manufac",
    computerName: "Tromsø",
    userGivenName: "Testy",
    userSurname: "Testerson",
  };
  describe("handler() responses", async () => {
    const sandbox = sinon.createSandbox();

    // eslint-disable-next-line prefer-arrow-callback
    beforeEach("reset data", async function () {
      functionsTest.mockConfig({ tybalt: { radiator: { secret: "asdf" } } });
      await cleanupFirestore(projectId);
    });

    // eslint-disable-next-line prefer-arrow-callback
    afterEach(function () {
      sandbox.restore();
    });

    it("(401 Unauthorized) if request header doesn't include the env secret", async () => {
      let result = await handler(Req({ body: { ...data } }), Res());
      assert.equal(result.status.args[0][0], 401);
      assert.equal(result.send.args[0][0], "request secret doesn't match expected");
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
      const user1 = { givenName: data.userGivenName, lastComputer: "SN325,hp", surname: data.userSurname, updated: new Date(), upn: data.upn, userSourceAnchor: data.userSourceAnchor };
      const user2 = { givenName: "FirstDuplicate", lastComputer: "SN325,hp", surname: "LastDuplicate", updated: new Date(), upn: "different@upn.com", userSourceAnchor: data.userSourceAnchor };
      await db.collection("Users").add(user1);
      await db.collection("Users").add(user2);
      let result = await handler(
        Req({ body: { ...data }, authType: "TYBALT", token: "asdf" }),
        Res()
      );
      assert.equal(result.status.args[0][0], 202);

      // check that an entry in raw logins was created due to duplicate users
      const rawlogins = await db.collection("RawLogins").get(); 
      assert.equal(rawlogins.size, 1);
      assert.equal(rawlogins.docs[0].get("error"),`Multiple users have userSourceAnchor: ${data.userSourceAnchor}`);
      
      // check that no entry was created in computers
      const computers = await db.collection("Computers").get();
      assert.equal(computers.size, 0);

    });
    it("(202 Accepted) if an invalid JSON login is POSTed", async () => {
      let result = await handler(
        Req({
          body: { ...data, networkConfig: {} },
          authType: "TYBALT",
          token: "asdf",
        }),
        Res()
      );
      assert.equal(result.status.args[0][0], 202);

      // check that an entry in raw logins was created due to invalid JSON
      const rawlogins = await db.collection("RawLogins").get(); 
      assert.equal(rawlogins.size, 1);
      assert.isArray(rawlogins.docs[0].get("error"));
     });
    /*
    // There's no way to simulate this error in the emulator
    // so it has been commented out
    it("(500 Internal Server Error) if database write fails", async () => {
      let result = await handler(
        Req({ body: { ...data }, authType: "TYBALT", token: "asdf" }),
        Res()
      );
      assert.equal(result.status.args[0][0], 500);
    });
    */
  });
  describe("removeIfFails keyword", () => {

    // eslint-disable-next-line prefer-arrow-callback
    beforeEach("reset data", async function () {
      functionsTest.mockConfig({ tybalt: { radiator: { secret: "asdf" } } });
      await cleanupFirestore(projectId);
    });
    
    it("strips the empty email property and accepts as valid from an otherwise valid login", async () => {
      resultAsExpected(await handler(
        Req({
          body: { ...data, email: "" },
          authType: "TYBALT",
          token: "asdf",
        }),
        Res()
      ))
      // verify only one user exists and that the email matches
      const users = await db.collection("Users").get();
      assert.equal(users.size, 1);
      assert.isUndefined(users.docs[0].get("email"));
    });
  });
});
