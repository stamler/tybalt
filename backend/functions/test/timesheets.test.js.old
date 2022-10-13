// Integration testing timesheets.js functions
// Based on https://github.com/firebase/quickstart-testing/blob/master/unit-test-cloud-functions/functions/test/functions.spec.js

// Some help with setup
// https://github.com/ryanmeisters/firebase-callable-emulator-test/blob/master/functions/src/index.tests.ts

// https://github.com/firebase/quickstart-nodejs/issues/96

const chai = require("chai");
const assert = chai.assert;
const { zonedTimeToUtc } = require("date-fns-tz");

const firebase = require("@firebase/testing");
const MY_PROJECT_ID = "charade-ca63f";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("timesheets.js", () => {
  // eslint-disable-next-line prefer-arrow-callback
  before(async function () {
    const process = require("process");
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";
    const admin = require("firebase-admin");
    const adminApp = admin.initializeApp({ projectId: MY_PROJECT_ID });

    const userRecords = [
      {
        uid: "alice",
        email: "alice@example.com",
        emailVerified: true,
        password: "secretPassword",
        displayName: "Alice",
        disabled: false,
      },
      {
        uid: "bob",
        email: "bob@example.com",
        emailVerified: true,
        password: "secretPassword",
        displayName: "Bob",
        disabled: false,
      },
    ];

    for (const userRecord of userRecords) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await adminApp.auth().createUser(userRecord);
      } catch (error) {
        if (error.code === "auth/email-already-exists") {
          console.log("User already exists, proceeding");
        } else {
          console.log(JSON.stringify(error));
          throw error;
        }
      }
    }
  });
  describe("writeWeekEnding()", () => {
    const testApp = firebase.initializeAdminApp({ projectId: MY_PROJECT_ID });
    const db = testApp.firestore();

    it("adds a correct weekEnding to a fresh document", async () => {
      const abc = await db.collection("TimeEntries").doc("abc");
      const foo = await db.collection("TimeEntries").doc("foo");

      await abc.set({ date: new Date("2020-10-09") });
      await foo.set({ date: new Date("2020-07-31") });

      await sleep(3300);
      let snap = await abc.get();
      let weekEnding = snap.get("weekEnding");
      let utc_weekEnding = zonedTimeToUtc(
        new Date(2020, 9, 10, 23, 59, 59, 999),
        "America/Thunder_Bay"
      );
      assert(weekEnding.toDate().valueOf() === utc_weekEnding.valueOf());

      snap = await foo.get();
      weekEnding = snap.get("weekEnding");
      utc_weekEnding = zonedTimeToUtc(
        new Date(2020, 7, 1, 23, 59, 59, 999),
        "America/Thunder_Bay"
      );
      assert(weekEnding.toDate().valueOf() === utc_weekEnding.valueOf());
      return;
    }).timeout(3400);

    it("updates a correct weekEnding on a modified document", async () => {
      // use the document 'abc' from the first test
      // modify the date and verify
      const abc = await db.collection("TimeEntries").doc("abc");
      const foo = await db.collection("TimeEntries").doc("foo");

      await abc.set({ date: new Date("2020-10-19") }, { merge: true });
      await foo.set({ date: new Date("2020-08-01") }, { merge: true });

      await sleep(2400);
      let snap = await abc.get();
      let weekEnding = snap.get("weekEnding");
      let utc_weekEnding = zonedTimeToUtc(
        new Date(2020, 9, 24, 23, 59, 59, 999),
        "America/Thunder_Bay"
      );
      assert(weekEnding.toDate().valueOf() === utc_weekEnding.valueOf());

      snap = await foo.get();
      weekEnding = snap.get("weekEnding");
      utc_weekEnding = zonedTimeToUtc(
        new Date(2020, 7, 1, 23, 59, 59, 999),
        "America/Thunder_Bay"
      );
      assert(weekEnding.toDate().valueOf() === utc_weekEnding.valueOf());
      return;
    }).timeout(3000);

    it("updates the weekEnding if it was modified manually by the client", async () => {
      // use the document 'abc' from the first and second test
      // modify the weekEnding and verify
      const abc = await db.collection("TimeEntries").doc("abc");
      const foo = await db.collection("TimeEntries").doc("foo");

      await abc.set({ weekEnding: new Date("2020-11-07") }, { merge: true });
      await foo.set({ weekEnding: new Date("2020-08-03") }, { merge: true });

      await sleep(2400);
      let snap = await abc.get();
      let weekEnding = snap.get("weekEnding");
      let utc_weekEnding = zonedTimeToUtc(
        new Date(2020, 9, 24, 23, 59, 59, 999),
        "America/Thunder_Bay"
      );
      assert(weekEnding.toDate().valueOf() === utc_weekEnding.valueOf());

      snap = await foo.get();
      weekEnding = await snap.get("weekEnding");
      utc_weekEnding = zonedTimeToUtc(
        new Date(2020, 7, 1, 23, 59, 59, 999),
        "America/Thunder_Bay"
      );
      assert(weekEnding.toDate().valueOf() === utc_weekEnding.valueOf());
      return;
    }).timeout(3000);

    it("exits and logs an error if date field is missing");
    it("exits and logs an informational message if a document was deleted");
  });

});
