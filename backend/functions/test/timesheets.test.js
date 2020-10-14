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

    const abc = await db.collection('TimeEntries').doc('abc');
    const foo = await db.collection('TimeEntries').doc('foo');

    await abc.set({ date: new Date("2020-10-09") });
    await foo.set({ date: new Date("2020-07-31") });
    
    await sleep(2400);
    let snap = await abc.get();
    let week_ending = snap.get('week_ending');

    assert(week_ending.toDate().valueOf() === new Date("2020-10-10T23:59:59.999Z").valueOf());

    snap = await foo.get();
    week_ending = snap.get('week_ending');

    assert(week_ending.toDate().valueOf() === new Date("2020-08-01T23:59:59.999Z").valueOf());
    return
  }).timeout(3000);

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

    assert(week_ending.toDate().valueOf() === new Date("2020-10-24T23:59:59.999Z").valueOf());

    snap = await foo.get();
    week_ending = snap.get('week_ending');

    assert(week_ending.toDate().valueOf() === new Date("2020-08-01T23:59:59.999Z").valueOf());
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

    assert(week_ending.toDate().valueOf() === new Date("2020-10-24T23:59:59.999Z").valueOf());

    snap = await foo.get();
    week_ending = await snap.get('week_ending');

    assert(week_ending.toDate().valueOf() === new Date("2020-08-01T23:59:59.999Z").valueOf());

  }).timeout(3000);

  it("exits and logs an error if date field is missing")
  it("exits and logs an informational message if a document was deleted")

});