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

  describe("administrative timesheet with no job numbers or chargeable time", async () => {
    beforeEach("reset data", async () => {
      await cleanupFirestore(projectId);
      await db.collection("TimeEntries").add({ date: new Date(2020,0,4), uid: alice.uid, weekEnding, ...fullITDay });
      await db.collection("TimeEntries").add({ date: new Date(2020,0,5), uid: alice.uid, weekEnding, ...fullITDay });
      await db.collection("TimeEntries").add({ date: new Date(2020,0,6), uid: alice.uid, weekEnding, ...fullITDay });
      await db.collection("TimeEntries").add({ date: new Date(2020,0,7), uid: alice.uid, weekEnding, ...fullITDay });
    });  

    it("tallies and validates for salaried staff member with 40 regular hours", async () => {
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, ...fullITDay });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();
      assert.equal(timeEntries.size,5);
      const tally = await tallyAndValidate(auth, profile, timeEntries, weekEnding);
      assert.equal(tally.workHoursTally.hours,40,"hours tally doesn't match");
      assert.equal(tally.workHoursTally.jobHours,0, "jobHours tally doesn't match");
      assert.equal(tally.workHoursTally.noJobNumber,40, "noJobNumber tally doesn't match");
    });
    it("rejects for salaried staff member with fewer than 40 regular hours", async () => {
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();

      assert.equal(timeEntries.size,4);
      await assert.isRejected(
        tallyAndValidate(auth, profile, timeEntries, weekEnding),
        "Salaried staff must have a minimum of 40 hours on each time sheet."
      );
    });    
    it("rejects for salaried or hourly staff member with missing tbtePayrollId", async () => {
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, ...fullITDay });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();

      assert.equal(timeEntries.size,5);
      const profileB = tester.firestore.makeDocumentSnapshot({ ...alice, salary: false, managerUid: "bob", managerName: "Bob Example"},"Profiles/alice");
      const profileC = tester.firestore.makeDocumentSnapshot({ ...alice, salary: true, managerUid: "bob", managerName: "Bob Example"},"Profiles/alice");
      await assert.isRejected(
        tallyAndValidate(auth, profileB, timeEntries, weekEnding),
        "The Profile for this user doesn't contain a tbtePayrollId"
      );
      await assert.isRejected(
        tallyAndValidate(auth, profileC, timeEntries, weekEnding),
        "The Profile for this user doesn't contain a tbtePayrollId"
      );
    });    
    it("tallies and validates for hourly staff member with fewer than 40 regular hours", async () => {
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();

      const profileB = tester.firestore.makeDocumentSnapshot({ ...alice, salary: false, managerUid: "bob", managerName: "Bob Example", tbtePayrollId: 28},"Profiles/alice");
      assert.equal(timeEntries.size,4);
      const tally = await tallyAndValidate(auth, profileB, timeEntries, weekEnding);
      assert.equal(tally.workHoursTally.hours,32,"hours tally doesn't match");
      assert.equal(tally.workHoursTally.jobHours,0, "jobHours tally doesn't match");
      assert.equal(tally.workHoursTally.noJobNumber,32, "noJobNumber tally doesn't match");
    });    
    it("rejects for salaried staff member if PPTO pushes hours over 40", async () => {
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "OP", timetypeName: "PPTO", hours: 9 });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();

      assert.equal(timeEntries.size,5);
      await assert.isRejected(
        tallyAndValidate(auth, profile, timeEntries, weekEnding),
        "Salaried staff cannot claim Vacation or PPTO entries that increase total hours beyond 40."
      );
    });    
    it("rejects for salaried staff member if Vacation pushes hours over 40", async () => {
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "OV", timetypeName: "Vacation", hours: 9 });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();

      assert.equal(timeEntries.size,5);
      await assert.isRejected(
        tallyAndValidate(auth, profile, timeEntries, weekEnding),
        "Salaried staff cannot claim Vacation or PPTO entries that increase total hours beyond 40."
      );
    });    
  });
});