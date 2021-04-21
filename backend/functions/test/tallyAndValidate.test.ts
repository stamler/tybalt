import { admin, projectId } from "./index.test";

import "mocha";

import * as chai from "chai";    
import * as chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);
const assert = chai.assert;

import * as test from "firebase-functions-test";
const tester = test();

import { tallyAndValidate } from "../src/tallyAndValidate";
import { cleanupFirestore } from "./helpers";

describe("tallyAndValidate", async () => {

  const db = admin.firestore();
  // a valid week2 ending
  const weekEnding = new Date("2021-01-09T23:59:59.999-05:00");

  const alice = { uid: "alice", displayName: "Alice Example", surname: "Example", givenName: "Alice" };
  //const bob = { uid: "bob", displayName: "Bob Example" };

  // a mock auth object
  const auth = { uid: "alice", token: {} as admin.auth.DecodedIdToken };

  // a mock profile object
  const profile = tester.firestore.makeDocumentSnapshot({ ...alice, salary: true, managerUid: "bob", managerName: "Bob Example", tbtePayrollId: 28}, "Profiles/alice");

  const workDescription = "Generic Description";
  const fullITDay = { division: "CI", divisionName: "Information Technology", timetype: "R", timetypeName: "Hours Worked", hours: 8, workDescription };

  beforeEach("reset data", async () => {
    await cleanupFirestore(projectId);
    await db.collection("TimeEntries").add({ date: new Date(2020,0,4), uid: alice.uid, weekEnding, ...fullITDay });
    await db.collection("TimeEntries").add({ date: new Date(2020,0,5), uid: alice.uid, weekEnding, ...fullITDay });
    await db.collection("TimeEntries").add({ date: new Date(2020,0,6), uid: alice.uid, weekEnding, ...fullITDay });
    await db.collection("TimeEntries").add({ date: new Date(2020,0,7), uid: alice.uid, weekEnding, ...fullITDay });
    await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, ...fullITDay });
  });

  describe("administrative timesheet with no job numbers or chargeable time", () => {

    it("tallies and validates for salaried staff member with 40 regular hours", async () => {
      const timeEntries00 = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();
      assert.equal(timeEntries00.size,5);
      const tally = await tallyAndValidate(auth, profile, timeEntries00, weekEnding);
      assert.equal(tally.workHoursTally.hours,40);
      assert.equal(tally.workHoursTally.jobHours,0);
      assert.equal(tally.workHoursTally.noJobNumber,40);
    });    
    it("rejects for salaried staff member with fewer than 40 regular hours", async () => {
      const timeEntries01 = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .limit(4)
        .get();

      assert.equal(timeEntries01.size,4);
      await assert.isRejected(tallyAndValidate(auth, profile, timeEntries01, weekEnding))
    });    
  });
});