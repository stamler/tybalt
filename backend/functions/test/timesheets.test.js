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
  const testApp = firebase.initializeAdminApp({ projectId: MY_PROJECT_ID });
  const db = testApp.firestore();

  it("adds a correct week_ending to a fresh document", async () => {

    const docRef = await db.collection('TimeEntries').doc('abc');
    docRef.set({ date: new Date("2020-10-09") });
    
    await sleep(2500)
    const snap = await docRef.get();
    const week_ending = snap.get('week_ending');

    return assert(week_ending.toDate().valueOf() === new Date("2020-10-10T23:59:59.999Z").valueOf());
  }).timeout(3000);

  it("updates a correct week_ending on a modified document", async () => {
    // use the document 'abc' from the first test    
    // modify the date and verify
    const docRef = await db.collection('TimeEntries').doc('abc');
    docRef.set({ date: new Date("2020-10-19") }, { merge: true });
    await sleep(2300)
    const snap = await docRef.get();
    const week_ending = snap.get('week_ending');


    return assert(week_ending.toDate().valueOf() === new Date("2020-10-24T23:59:59.999Z").valueOf());
  }).timeout(3000);

});