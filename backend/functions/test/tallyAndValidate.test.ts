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
import * as _ from "lodash";

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

  describe("timesheet with no job numbers or chargeable time", async () => {
    const fullITDay = { division: "CI", divisionName: "Information Technology", timetype: "R", timetypeName: "Hours Worked", hours: 8, workDescription };
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
    it("tallies and validates for salaried staff member with PPTO", async () => {
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "OP", timetypeName: "PPTO", hours: 4 });
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "OP", timetypeName: "PPTO", hours: 4 });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();
      assert.equal(timeEntries.size,6);
      const tally = await tallyAndValidate(auth, profile, timeEntries, weekEnding);
      assert.equal(tally.workHoursTally.hours,32,"hours tally doesn't match");
      assert.equal(tally.workHoursTally.jobHours,0, "jobHours tally doesn't match");
      assert.equal(tally.workHoursTally.noJobNumber,32, "noJobNumber tally doesn't match");
      assert.equal(tally.nonWorkHoursTally.OP, 8, "PPTO tally doesn't match");
      assert(_.isEqual(tally.timetypes.sort(), ["OP", "R"]));
      assert(_.isEqual(tally.divisions, ["CI"]));
    });
    it("rejects for salary or hourly staff member if a 'R' time entry is missing hours", async () => {
      const { hours, ...missingHours } = fullITDay;
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, ...missingHours });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();
      assert.equal(timeEntries.size,5);
      const profileB = tester.firestore.makeDocumentSnapshot({ ...alice, salary: false, managerUid: "bob", managerName: "Bob Example", tbtePayrollId: 28},"Profiles/alice");
      await assert.isRejected(
        tallyAndValidate(auth, profile, timeEntries, weekEnding),
        "The TimeEntry is missing an hours field"
      );
      await assert.isRejected(
        tallyAndValidate(auth, profileB, timeEntries, weekEnding),
        "The TimeEntry is missing an hours field"
      )
    });
    it("tallies and validates for salaried staff member with off rotation days (OR) if their profile has offRotation: true", async () => {
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "OR", timetypeName: "Off Rotation (Full Day)" });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();
      assert.equal(timeEntries.size,5);
      const profileB = tester.firestore.makeDocumentSnapshot({ ...alice, offRotation: true, salary: true, managerUid: "bob", managerName: "Bob Example", tbtePayrollId: 28}, "Profiles/alice");
      const tally = await tallyAndValidate(auth, profileB, timeEntries, weekEnding);
      assert.equal(tally.workHoursTally.hours,32,"hours tally doesn't match");
      assert.equal(tally.workHoursTally.jobHours,0, "jobHours tally doesn't match");
      assert.equal(tally.workHoursTally.noJobNumber,32, "noJobNumber tally doesn't match");
      assert.equal(tally.offRotationDaysTally,1, "offRotationDaysTally doesn't match");
    });
    it("rejects for salaried staff member with off rotation days (OR) if their profile has offRotation missing or false", async () => {
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "OR", timetypeName: "Off Rotation (Full Day)" });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();
      assert.equal(timeEntries.size,5);
      await assert.isRejected(
        tallyAndValidate(auth, profile, timeEntries, weekEnding),
        "Salaried staff need permission to claim Off Rotation Entries. Speak with your manager."
      );
      const profileB = tester.firestore.makeDocumentSnapshot({ ...alice, offRotation: false, salary: true, managerUid: "bob", managerName: "Bob Example", tbtePayrollId: 28}, "Profiles/alice");
      await assert.isRejected(
        tallyAndValidate(auth, profileB, timeEntries, weekEnding),
        "Salaried staff need permission to claim Off Rotation Entries. Speak with your manager."
      );

    });
    it("tallies and validates for hourly staff member with a Full Week Off Entry", async () => {
      await cleanupFirestore(projectId);
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "OW", timetypeName: "Full Week Off" });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();
      const profileB = tester.firestore.makeDocumentSnapshot({ ...alice, salary: false, managerUid: "bob", managerName: "Bob Example", tbtePayrollId: 28},"Profiles/alice");
      assert.equal(timeEntries.size,1);
      const tally = await tallyAndValidate(auth, profileB, timeEntries, weekEnding);
      assert.equal(tally.workHoursTally.hours,0,"hours tally doesn't match");
      assert.equal(tally.workHoursTally.jobHours,0, "jobHours tally doesn't match");
      assert.equal(tally.workHoursTally.noJobNumber,0, "noJobNumber tally doesn't match");
      assert.equal(tally.offRotationDaysTally,0, "offRotationDaysTally doesn't match");
      assert.equal(tally.offWeekTally,1, "offWeekTally doesn't match");
    });
    it("rejects for salaried staff member with more than one off rotation entry on the same day", async () => {
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "OR", timetypeName: "Off Rotation (Full Day)" });
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "OR", timetypeName: "Off Rotation (Full Day)" });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();
      assert.equal(timeEntries.size,6);
      await assert.isRejected(
        tallyAndValidate(auth, profile, timeEntries, weekEnding),
        "More than one Off-Rotation entry exists for 2020 Jan 08"
      );
    });
    it("rejects for hourly staff with a Full Week Off (OW) entry and any other entry", async () => {
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "OW", timetypeName: "Full Week Off" });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();
      const profileB = tester.firestore.makeDocumentSnapshot({ ...alice, salary: false, managerUid: "bob", managerName: "Bob Example", tbtePayrollId: 28},"Profiles/alice");
      assert.equal(timeEntries.size,5);
      await assert.isRejected(
        tallyAndValidate(auth, profileB, timeEntries, weekEnding),
        "A Full Week Off entry must be the only entry in a week."
      );
    });
    it("rejects for hourly staff with more than one Full Week Off (OW) entry", async () => {
      await cleanupFirestore(projectId);
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "OW", timetypeName: "Full Week Off" });
      await db.collection("TimeEntries").add({ date: new Date(2020,0,7), uid: alice.uid, weekEnding, timetype: "OW", timetypeName: "Full Week Off" });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();
      const profileB = tester.firestore.makeDocumentSnapshot({ ...alice, salary: false, managerUid: "bob", managerName: "Bob Example", tbtePayrollId: 28},"Profiles/alice");
      assert.equal(timeEntries.size,2);
      await assert.isRejected(
        tallyAndValidate(auth, profileB, timeEntries, weekEnding),
        "Only one Full Week Off entry can be claimed per week."
      );
    });
    it("rejects for salaried staff member with a Full Week Off (OW) entry", async () => {
      await cleanupFirestore(projectId);
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "OW", timetypeName: "Full Week Off" });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();
      assert.equal(timeEntries.size,1);
      await assert.isRejected(
        tallyAndValidate(auth, profile, timeEntries, weekEnding),
        "Salaried staff cannot claim a Full Week Off. Please use PPTO or vacation instead."
      );
    });
    it("tallies and validates for salaried staff member with fewer than 40 hours if skipMinTimeCheckOnNextBundle flag is set", async () => {
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
      const profileB = tester.firestore.makeDocumentSnapshot({ ...alice, salary: true, skipMinTimeCheckOnNextBundle: true, managerUid: "bob", managerName: "Bob Example", tbtePayrollId: 28}, "Profiles/alice");
      assert.equal(timeEntries.size,4);
      const tally = await tallyAndValidate(auth, profileB, timeEntries, weekEnding);
      assert.equal(tally.workHoursTally.hours,32,"hours tally doesn't match");
    });
    it("rejects for salaried staff member with fewer than 40 hours", async () => {
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
    it("rejects for salaried staff member who claims sick time", async () => {
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "OS", timetypeName: "Sick", hours: 8 });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();

      assert.equal(timeEntries.size,5);
      await assert.isRejected(
        tallyAndValidate(auth, profile, timeEntries, weekEnding),
        "Salaried staff cannot claim Sick time. Please use PPTO or vacation instead."
      );
    });
    it("rejects for salaried staff member with untrackedTimeOff:true who claims any OB, OH, OP, OV timetype(s)", async () => {
      // verify each rejection
      const profile2 = tester.firestore.makeDocumentSnapshot({ ...alice, salary: true, untrackedTimeOff:true, managerUid: "bob", managerName: "Bob Example", tbtePayrollId: 28}, "Profiles/alice");
      for (let timetype of ["OB", "OH", "OP", "OV"]) {
        await db.collection("TimeEntries").doc(timetype).set({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype, timetypeName: "Testing Placeholder", hours: 8 });
        let timeEntries = await db
          .collection("TimeEntries")
          .where("uid", "==", alice.uid)
          .where("weekEnding", "==", weekEnding)
          .orderBy("date", "asc")
          .get();
        assert.equal(timeEntries.size,5);
        await assert.isRejected(
          tallyAndValidate(auth, profile2, timeEntries, weekEnding),
          `Staff with untracked time off are only permitted to create TimeEntries of type “Hours Worked” or “Training”`
        );
        await db.collection("TimeEntries").doc(timetype).delete();
      }
    });
    it("tallies and validates for hourly staff member who claims sick time", async () => {
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "OS", timetypeName: "Sick", hours: 8 });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();

      const profileB = tester.firestore.makeDocumentSnapshot({ ...alice, salary: false, managerUid: "bob", managerName: "Bob Example", tbtePayrollId: 28},"Profiles/alice");
      assert.equal(timeEntries.size,5);
      const tally = await tallyAndValidate(auth, profileB, timeEntries, weekEnding);
      assert.equal(tally.workHoursTally.hours,32,"hours tally doesn't match");
      assert.equal(tally.workHoursTally.jobHours,0, "jobHours tally doesn't match");
      assert.equal(tally.workHoursTally.noJobNumber,32, "noJobNumber tally doesn't match");
      assert.equal(tally.nonWorkHoursTally.OS,8, "sick tally doesn't match");
    });
    it("tallies and validates for hourly staff member who requests overtime payout", async () => {
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "OTO", timetypeName: "Request Overtime Payout", payoutRequestAmount: 499 });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();

      const profileB = tester.firestore.makeDocumentSnapshot({ ...alice, salary: false, managerUid: "bob", managerName: "Bob Example", tbtePayrollId: 28},"Profiles/alice");
      assert.equal(timeEntries.size,5);
      const tally = await tallyAndValidate(auth, profileB, timeEntries, weekEnding);
      assert.equal(tally.workHoursTally.hours,32,"hours tally doesn't match");
      assert.equal(tally.workHoursTally.jobHours,0, "jobHours tally doesn't match");
      assert.equal(tally.workHoursTally.noJobNumber,32, "noJobNumber tally doesn't match");
      assert.equal(tally.payoutRequest, 499, "payoutRequest doesn't match");
    });
    it("tallies and validates for hourly staff member who add overtime to bank", async () => {
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, ...fullITDay });
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, ...fullITDay });
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "RB", timetypeName: "Add Overtime to Bank", hours: 4 });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();

      const profileB = tester.firestore.makeDocumentSnapshot({ ...alice, salary: false, managerUid: "bob", managerName: "Bob Example", tbtePayrollId: 28},"Profiles/alice");
      assert.equal(timeEntries.size,7);
      const tally = await tallyAndValidate(auth, profileB, timeEntries, weekEnding);
      assert.equal(tally.workHoursTally.hours,48,"hours tally doesn't match");
      assert.equal(tally.workHoursTally.jobHours,0, "jobHours tally doesn't match");
      assert.equal(tally.workHoursTally.noJobNumber,48, "noJobNumber tally doesn't match");
      assert.equal(tally.bankedHours,4, "bankedHours tally doesn't match");
    });
    it("rejects for salaried staff member who add overtime to bank", async () => {
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, ...fullITDay });
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, ...fullITDay });
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "RB", timetypeName: "Add Overtime to Bank", hours: 4 });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();

      assert.equal(timeEntries.size,7);
      await assert.isRejected(
        tallyAndValidate(auth, profile, timeEntries, weekEnding),
        "Salaried staff cannot bank overtime."
      )
    });
    it("rejects for hourly staff member who creates more than one overtime bank entry", async () => {
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, ...fullITDay });
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, ...fullITDay });
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "RB", timetypeName: "Add Overtime to Bank", hours: 2 });
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "RB", timetypeName: "Add Overtime to Bank", hours: 2 });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();

      const profileB = tester.firestore.makeDocumentSnapshot({ ...alice, salary: false, managerUid: "bob", managerName: "Bob Example", tbtePayrollId: 28},"Profiles/alice");
      assert.equal(timeEntries.size,8);
      await assert.isRejected(
        tallyAndValidate(auth, profileB, timeEntries, weekEnding),
        "Only one overtime banking entry can exist on a timesheet."
      )
    });
    it("rejects for hourly staff member who add overtime to bank but didn't leave at least 44 hours", async () => {
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, ...fullITDay });
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "RB", timetypeName: "Add Overtime to Bank", hours: 4 });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();

      const profileB = tester.firestore.makeDocumentSnapshot({ ...alice, salary: false, managerUid: "bob", managerName: "Bob Example", tbtePayrollId: 28},"Profiles/alice");
      assert.equal(timeEntries.size,6);
      await assert.isRejected(
        tallyAndValidate(auth, profileB, timeEntries, weekEnding),
        "Banked hours cannot bring your total worked hours below 44 hours on a timesheet."
      )
    });
    it("rejects for salaried staff member who requests overtime payout", async () => {
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, ...fullITDay });
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "OTO", timetypeName: "Request Overtime Payout", payoutRequestAmount: 499 });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();

      assert.equal(timeEntries.size,6);
      await assert.isRejected(
        tallyAndValidate(auth, profile, timeEntries, weekEnding),
        "Salaried staff cannot request overtime payouts. Please speak with management."
      )
    });
    it("rejects for hourly staff member who includes more than one overtime payout request", async () => {
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "OTO", timetypeName: "Request Overtime Payout", payoutRequestAmount: 499 });
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, timetype: "OTO", timetypeName: "Request Overtime Payout", payoutRequestAmount: 200 });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();

      const profileB = tester.firestore.makeDocumentSnapshot({ ...alice, salary: false, managerUid: "bob", managerName: "Bob Example", tbtePayrollId: 28},"Profiles/alice");
      assert.equal(timeEntries.size,6);
      await assert.isRejected(
        tallyAndValidate(auth, profileB, timeEntries, weekEnding),
        "Only one payout request entry can exist on a timesheet."
      )
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
    it("rejects for salaried or hourly staff member with missing managerUid", async () => {
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, ...fullITDay });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();

      assert.equal(timeEntries.size,5);
      const profileB = tester.firestore.makeDocumentSnapshot({ ...alice, salary: false, tbtePayrollId: 28 },"Profiles/alice");
      const profileC = tester.firestore.makeDocumentSnapshot({ ...alice, salary: true, tbtePayrollId: 28 },"Profiles/alice");
      await assert.isRejected(
        tallyAndValidate(auth, profileB, timeEntries, weekEnding),
        "The Profile for this user doesn't contain a managerUid"
      );
      await assert.isRejected(
        tallyAndValidate(auth, profileC, timeEntries, weekEnding),
        "The Profile for this user doesn't contain a managerUid"
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
  describe("timesheet with job numbers or chargeable time", async () => {

    const jobPartial = { client: "Superman", jobDescription: "Earth Rotation", job: "25-001", jobHours: 4 }
    const jobPartial2 = { client: "Lex Luthor", jobDescription: "Counter-Earth Rotation", job: "25-002", jobHours: 8 }
    const jobPartial3 = { client: "Lex Luthor", jobDescription: "Neutralize Superman", job: "25-003", jobHours: 8 }
    const fullEEDay = { division: "EE", divisionName: "Environmental", timetype: "R", timetypeName: "Hours Worked", hours: 4, workDescription, ...jobPartial };
    beforeEach("reset data", async () => {
      await cleanupFirestore(projectId);
      await db.collection("Jobs").doc("25-001").set({ client: "Superman", description: "Earth Rotation", manager: "Joe Schmoe", status: "Active" });
      await db.collection("Jobs").doc("25-002").set({ client: "Lex Luthor", description: "Counter-Earth Rotation", manager: "Joe Schmoe", status: "Active" });
      await db.collection("Jobs").doc("25-003").set({ client: "Lex Luthor", description: "Neuralize Superman", manager: "Joe Schmoe", status: "Cancelled" });
      await db.collection("TimeEntries").add({ date: new Date(2020,0,4), uid: alice.uid, weekEnding, ...fullEEDay });
      await db.collection("TimeEntries").add({ date: new Date(2020,0,5), uid: alice.uid, weekEnding, ...fullEEDay });
      await db.collection("TimeEntries").add({ date: new Date(2020,0,6), uid: alice.uid, weekEnding, ...fullEEDay });
      await db.collection("TimeEntries").add({ date: new Date(2020,0,7), uid: alice.uid, weekEnding, ...fullEEDay });
    });
    it("tallies and validates for salaried staff member with 40 regular hours", async () => {
      const fullEEDay2 = { division: "EG", divisionName: "Geotechnical", timetype: "R", timetypeName: "Hours Worked", workDescription, mealsHours: 0.5, ...jobPartial2 }
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, ...fullEEDay2 });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();
      assert.equal(timeEntries.size,5);
      const tally = await tallyAndValidate(auth, profile, timeEntries, weekEnding);
      assert.equal(tally.workHoursTally.hours,16,"hours tally doesn't match");
      assert.equal(tally.workHoursTally.jobHours,24, "jobHours tally doesn't match");
      assert.equal(tally.workHoursTally.noJobNumber,0, "noJobNumber tally doesn't match");
      assert.equal(tally.mealsHoursTally,0.5, "mealsHoursTally doesn't match");
      assert.equal(tally.jobsTally["25-001"].hours,16, "hours tally for job 25-001 doesn't match");
      assert.equal(tally.jobsTally["25-001"].jobHours,16, "jobHours tally for job 25-001 doesn't match");
      assert.equal(tally.jobsTally["25-002"].hours,0, "hours tally for job 25-002 doesn't match");
      assert.equal(tally.jobsTally["25-002"].jobHours,8, "jobHours tally for job 25-002 doesn't match");
      assert(_.isEqual(tally.timetypes, ["R"]));
      assert(_.isEqual(tally.divisions.sort(), ["EE", "EG"]));
      assert(_.isEqual(tally.divisions.sort(), Object.keys(tally.divisionsTally).sort()));
      assert(_.isEqual(tally.jobNumbers.sort(),["25-001", "25-002"]));
      assert(_.isEqual(tally.jobNumbers.sort(),Object.keys(tally.jobsTally).sort()));
    });
    it("tallies and validates for salaried staff member with fewer than 40 regular hours if untrackedTimeOff:true", async () => {
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();
      assert.equal(timeEntries.size,4);
      const profile2 = tester.firestore.makeDocumentSnapshot({ ...alice, salary: true, untrackedTimeOff:true, managerUid: "bob", managerName: "Bob Example", tbtePayrollId: 28}, "Profiles/alice");
      const tally = await tallyAndValidate(auth, profile2, timeEntries, weekEnding);
      assert.equal(tally.workHoursTally.hours,16,"hours tally doesn't match");
      assert.equal(tally.workHoursTally.jobHours,16, "jobHours tally doesn't match");
      assert.equal(tally.workHoursTally.noJobNumber,0, "noJobNumber tally doesn't match");
      assert.equal(tally.jobsTally["25-001"].hours,16, "hours tally for job 25-001 doesn't match");
      assert.equal(tally.jobsTally["25-001"].jobHours,16, "jobHours tally for job 25-001 doesn't match");
      assert(_.isEqual(tally.timetypes, ["R"]));
      assert(_.isEqual(tally.divisions.sort(), ["EE"]));
      assert(_.isEqual(tally.divisions.sort(), Object.keys(tally.divisionsTally).sort()));
      assert(_.isEqual(tally.jobNumbers.sort(),["25-001"]));
      assert(_.isEqual(tally.jobNumbers.sort(),Object.keys(tally.jobsTally).sort()));
    });
    it("rejects if a job in a time entry isn't active", async () => {
      const fullEEDay2 = { division: "EG", divisionName: "Geotechnical", timetype: "R", timetypeName: "Hours Worked", workDescription, ...jobPartial3 }
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, ...fullEEDay2 });
      const timeEntries = await db
        .collection("TimeEntries")
        .where("uid", "==", alice.uid)
        .where("weekEnding", "==", weekEnding)
        .orderBy("date", "asc")
        .get();
      assert.equal(timeEntries.size,5);
      await assert.isRejected(
        tallyAndValidate(auth, profile, timeEntries, weekEnding),
        "failed to open 25-003: Job status isn't Active. Ask a job admin to mark it Active then resubmit."
      );
    });
    it("rejects if a specific workrecord appears in more than one entry", async () => {
      const fullEEDay2 = { division: "EG", divisionName: "Geotechnical", timetype: "R", timetypeName: "Hours Worked", workDescription, mealsHours: 0.5, workrecord:"K20-123", ...jobPartial2 }
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, ...fullEEDay2 });
      let timeEntries = await db
      .collection("TimeEntries")
      .where("uid", "==", alice.uid)
      .where("weekEnding", "==", weekEnding)
      .orderBy("date", "asc")
      .get();
      assert.equal(timeEntries.size,5);
      const tally = await tallyAndValidate(auth, profile, timeEntries, weekEnding);
      assert(_.isEqual(tally.timetypes, ["R"]));
      const fullDay3 = { division: "EG", divisionName: "Geotechnical", timetype: "R", timetypeName: "Hours Worked", workDescription, mealsHours: 0.5, workrecord:"K20-123", ...jobPartial }
      await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, ...fullDay3 });
      timeEntries = await db
      .collection("TimeEntries")
      .where("uid", "==", alice.uid)
      .where("weekEnding", "==", weekEnding)
      .orderBy("date", "asc")
      .get();
      assert.equal(timeEntries.size,6);
      await assert.isRejected(
        tallyAndValidate(auth, profile, timeEntries, weekEnding),
        "The same work record appears in multiple entries"
      );
    });
  });
});