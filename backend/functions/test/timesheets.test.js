// Integration testing timesheets.js functions
// Based on https://github.com/firebase/quickstart-testing/blob/master/unit-test-cloud-functions/functions/test/functions.spec.js

// Some help with setup 
// https://github.com/ryanmeisters/firebase-callable-emulator-test/blob/master/functions/src/index.tests.ts

// https://github.com/firebase/quickstart-nodejs/issues/96

const chai = require('chai')
const assert = chai.assert;
const { zonedTimeToUtc } = require('date-fns-tz');

const firebase = require("@firebase/testing");
const MY_PROJECT_ID = "charade-ca63f";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe("writeWeekEnding()", () => {
  const testApp = firebase.initializeAdminApp({ projectId: MY_PROJECT_ID });
  const db = testApp.firestore();

  it("adds a correct week_ending to a fresh document", async () => {

    const abc = await db.collection('TimeEntries').doc('abc');
    const foo = await db.collection('TimeEntries').doc('foo');

    await abc.set({ date: new Date("2020-10-09") });
    await foo.set({ date: new Date("2020-07-31") });
    
    await sleep(3000);
    let snap = await abc.get();
    let week_ending = snap.get('week_ending');
    let utc_week_ending = zonedTimeToUtc( new Date(2020,9,10,23,59,59,999), 'America/Thunder_Bay');
    assert(week_ending.toDate().valueOf() === utc_week_ending.valueOf());

    snap = await foo.get();
    week_ending = snap.get('week_ending');
    utc_week_ending = zonedTimeToUtc( new Date(2020,7,1,23,59,59,999), 'America/Thunder_Bay');
    assert(week_ending.toDate().valueOf() === utc_week_ending.valueOf());
    return
  }).timeout(3400);

  it("updates a correct week_ending on a modified document", async () => {
    // use the document 'abc' from the first test    
    // modify the date and verify
    const abc = await db.collection('TimeEntries').doc('abc');
    const foo = await db.collection('TimeEntries').doc('foo');

    await abc.set({ date: new Date("2020-10-19") }, { merge: true });
    await foo.set({ date: new Date("2020-08-01") }, { merge: true });

    await sleep(2400);
    let snap = await abc.get();
    let week_ending = snap.get('week_ending');
    let utc_week_ending = zonedTimeToUtc( new Date(2020,9,24,23,59,59,999), 'America/Thunder_Bay');
    assert(week_ending.toDate().valueOf() === utc_week_ending.valueOf());

    snap = await foo.get();
    week_ending = snap.get('week_ending');
    utc_week_ending = zonedTimeToUtc( new Date(2020,7,1,23,59,59,999), 'America/Thunder_Bay');
    assert(week_ending.toDate().valueOf() === utc_week_ending.valueOf());
    return
  }).timeout(3000);

  it("updates the week_ending if it was modified manually by the client", async () => {
    // use the document 'abc' from the first and second test    
    // modify the week_ending and verify
    const abc = await db.collection('TimeEntries').doc('abc');
    const foo = await db.collection('TimeEntries').doc('foo');

    await abc.set({ week_ending: new Date("2020-11-07") }, { merge: true });
    await foo.set({ week_ending: new Date("2020-08-03") }, { merge: true });

    await sleep(2400);
    let snap = await abc.get();
    let week_ending = snap.get('week_ending');
    let utc_week_ending = zonedTimeToUtc( new Date(2020,9,24,23,59,59,999), 'America/Thunder_Bay');
    assert(week_ending.toDate().valueOf() === utc_week_ending.valueOf());

    snap = await foo.get();
    week_ending = await snap.get('week_ending');
    utc_week_ending = zonedTimeToUtc( new Date(2020,7,1,23,59,59,999), 'America/Thunder_Bay');
    assert(week_ending.toDate().valueOf() === utc_week_ending.valueOf());
    return
  }).timeout(3000);

  it("exits and logs an error if date field is missing")
  it("exits and logs an informational message if a document was deleted")

});

describe("bundle", async () => {
  const auth = { uid: "alice", email: "alice@example.com" };
  const testApp = firebase.initializeTestApp({projectId: MY_PROJECT_ID, auth: {...auth, time: true} });

  // point at the emulator and get the callable
  testApp.functions().useFunctionsEmulator("http://localhost:5001");
  const bundleTimesheet = testApp.functions().httpsCallable("bundleTimesheet");

  // TODO: ensure the firestore is seeded with data for each test rather than
  const db = testApp.firestore();

  it("bundles a timesheet and deletes the TimeEntries if all conditions are met", async () => {
    // week ending Oct 10 2020 contains correct data in the local_test_data
    const week_ending = zonedTimeToUtc(
      new Date(2020,9,10,23,59,59,999), 'America/Thunder_Bay'
    );

    // assert that TimeEntries with week_ending: week_ending exist for this uid
    let snap = await db.collection('TimeEntries')
      .where("week_ending", "==", week_ending)
      .where("uid", "==", "alice")
      .get();
    assert(!snap.empty);

    // run the bundle so we can make assertions about the side effects
    console.log(week_ending.toString());
    console.log(week_ending.valueOf());
    await bundleTimesheet({ week_ending: week_ending.valueOf() })
    
    // assert that TimeEntries with week_ending: week_ending don't exist for this uid
    snap = await db.collection('TimeEntries')
      .where("week_ending", "==", week_ending)
      .where("uid", "==", "alice").get();
    assert(snap.empty);

    return
    // assert that the new TimeSheet was created
  });


  it("throws if there are multiple OR entries for the same day in a week"); // week ending Oct 3 2020
  it("throws if the provided week_ending is not a saturday"); // no data required
  it("throws if it cannot find a manager in the user's profile"); // create profile without manager_uid 
  it("throws if a manager_uid is specified that doesn't exist"); // need to stub auth()
  it("throws if the provided manager doesn't have the necessary permissions"); // neet to stub auth()
  it("throws if the user doesn't have a profile"); // create entries that are correct but reference an incorrect UID
  it("throws if it has been called for a week that has no entires"); // send a call to the emulator manually with no data

});