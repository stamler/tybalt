// Integration testing timesheets.js functions
// Based on https://github.com/firebase/quickstart-testing/blob/master/unit-test-cloud-functions/functions/test/functions.spec.js

// Some help with setup 
// https://github.com/ryanmeisters/firebase-callable-emulator-test/blob/master/functions/src/index.tests.ts

// https://github.com/firebase/quickstart-nodejs/issues/96

const chai = require('chai')
const assert = chai.assert;

const firebase = require("@firebase/testing");
const MY_PROJECT_ID = "charade-ca63f";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe("timesheets.js", () => {
  it("adds a correct week_ending to a fresh document", async () => {
    // You could use initializeTestApp if you want to simulate a write from a user (which goes
    // through security rules).  You need to use your real project ID so that the Functions and
    // Firestore emulators can communicate.
    const testApp = firebase.initializeAdminApp({ projectId: MY_PROJECT_ID });

    const db = testApp.firestore();
    const docRef = await db.collection('TimeEntries').add({ test_id: 6, date: new Date("2020-10-09") });

    // At this point you need to run a loop or a listener to make sure the function
    // does what it's supposed to.  The function will excute async after the Firestore write completes.
    
    await sleep(2500)
    const snap = await docRef.get();
    const week_ending = snap.get('week_ending');

    return assert(week_ending.toDate().valueOf() === new Date("2020-10-10T23:59:59.999Z").valueOf());
  }).timeout(5000);
});