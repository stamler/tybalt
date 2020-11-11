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

describe("bundle", async () => {
  // Follow the issue here
  // https://github.com/firebase/firebase-admin-node/issues/1077

  const process = require("process");
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";
  const admin = require("firebase-admin");

  console.log("tsbundleTEST checkpoint1");
  const adminApp = admin.initializeApp({ projectId: MY_PROJECT_ID });
  console.log("tsbundleTEST checkpoint2");

  try {
    await adminApp.auth().createUser({
      uid: "alice",
      email: "alice@example.com",
      emailVerified: true,
      password: "secretPassword",
      displayName: "Alice",
      disabled: false,
    });
  } catch (error) {
    console.log("Error creating new user:", error);
  }

  const auth = { uid: "alice", email: "alice@example.com" };
  const testApp = firebase.initializeTestApp({
    projectId: MY_PROJECT_ID,
    auth: { ...auth, time: true },
  });

  // point at the emulator and get the callable
  testApp.functions().useFunctionsEmulator("http://localhost:5001");
  const bundleTimesheet = testApp.functions().httpsCallable("bundleTimesheet");

  // TODO: ensure the firestore is seeded with data for each test rather than
  const db = testApp.firestore();

  it("bundles a timesheet and deletes the TimeEntries if all conditions are met", async () => {
    // week ending Oct 10 2020 contains correct data in the local_test_data
    const weekEnding = zonedTimeToUtc(
      new Date(2020, 9, 10, 23, 59, 59, 999),
      "America/Thunder_Bay"
    );

    // assert that TimeEntries with weekEnding: weekEnding exist for this uid
    let snap = await db
      .collection("TimeEntries")
      .where("weekEnding", "==", weekEnding)
      .where("uid", "==", "alice")
      .get();
    assert(
      !snap.empty,
      "There are no matching TimeEntries to bundle in the test data"
    );

    // run the bundle so we can make assertions about the side effects
    await bundleTimesheet({ weekEnding: weekEnding.valueOf() });

    // assert that TimeEntries with weekEnding: weekEnding don't exist for this uid
    snap = await db
      .collection("TimeEntries")
      .where("weekEnding", "==", weekEnding)
      .where("uid", "==", "alice")
      .get();
    assert(snap.empty, "Matching TimeEntries remain after bundling.");

    // assert that a new TimeSheet was created
    snap = await db
      .collection("TimeSheets")
      .where("weekEnding", "==", weekEnding)
      .where("uid", "==", "alice")
      .get();
    assert(
      snap.size === 1,
      "More or less than 1 bundled Timesheet exists for the query"
    );
    const timesheet = snap.docs[0].data();
    assert(timesheet.workHoursTally.hours === 40);
    assert(timesheet.workHoursTally.jobHours === 0);
    assert(timesheet.workHoursTally.mealsHours === 0);
    assert("CI" in timesheet.divisionsTally);
    assert.isEmpty(timesheet.jobsTally);
    assert.isEmpty(timesheet.nonWorkHoursTally);
    return;
  });

  it("throws if there are multiple OR entries for the same day in a week"); // week ending Oct 3 2020
  it("throws if the provided weekEnding is not a saturday"); // no data required
  it("throws if it cannot find a manager in the user's profile"); // create profile without managerUid
  it("throws if a managerUid is specified that doesn't exist"); // need to stub auth()
  it("throws if the provided manager doesn't have the necessary permissions"); // neet to stub auth()
  it("throws if the user doesn't have a profile"); // create entries that are correct but reference an incorrect UID
  it("throws if it has been called for a week that has no entires"); // send a call to the emulator manually with no data
});

describe("unbundle", async () => {
  it("throws when trying to unbundle a submitted timesheet");
  it("throws when trying to unbundle an approved timesheet");
  it("throws when trying to unbundle a locked timesheet");
});
