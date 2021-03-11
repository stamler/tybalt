import * as firebase from "@firebase/rules-unit-testing";
import "mocha";
//import * as wtf from "wtfnode";

const projectId = "charade-ca63f";

const alice = { displayName: "Alice Example", email: "alice@example.com" };
const bob = { displayName: "Bob Example", email: "bob@example.com" };
const adminDb = firebase.initializeAdminApp({ projectId }).firestore();
const timeDb = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, time: true } }).firestore();

const collections = [
  "Computers",
  "Config",
  "Divisions",
  "Expenses",
  "Jobs",
  "Logins",
  "Profiles",
  "RawLogins",
  "TimeEntries",
  "TimeSheets",
  "TimeTracking",
  "TimeAmendments",
  "TimeTypes",
  "Users",
];

function denyUnauthenticatedReadWrite(collection: string) {
  it(`${collection} denies unauthenticated read/write`, async () => {
    const dbUnauthenticated = firebase.initializeTestApp({ projectId }).firestore();
    const doc = dbUnauthenticated.collection(collection).doc();
    await firebase.assertFails(doc.get());
    await firebase.assertFails(doc.set({ foo: "bar" }));
  });
}

function denyAuthenticatedWrite(collection: string) {
  return it(`${collection} denies signed-in users writing`, async () => {
    const auth = { uid: "alice", email: "alice@example.com" };
    const db = firebase.initializeTestApp({ projectId, auth }).firestore();
    const doc = db.collection(collection).doc();
    await firebase.assertFails(doc.set({ foo: "bar" }));
  });
}

function allowAuthenticatedRead(collection: string) {
  return it(`${collection} allows all authenticated users to read`, async () => {
    const auth = { uid: "alice", email: "alice@example.com" };
    const db = firebase.initializeTestApp({ projectId, auth }).firestore();
    const doc = db.collection(collection).doc();
    await firebase.assertSucceeds(doc.get());
  });
}

function denyAuthenticatedRead(collection: string) {
  return it(`${collection} denies authenticated users reading`, async () => {
    const auth = { uid: "alice", email: "alice@example.com" };
    const db = firebase.initializeTestApp({ projectId, auth }).firestore();
    const doc = db.collection(collection).doc();
    await firebase.assertFails(doc.get());
  });
}

function allowAdminRead(collection: string) {
  return it(`${collection} allows admin-claim users to read`, async () => {
    const auth = { uid: "alice", email: "alice@example.com" };
    const db = firebase.initializeTestApp({ projectId, auth: {...auth, admin: true} }).firestore();
    const doc = db.collection(collection).doc();
    await firebase.assertSucceeds(doc.get());
  });
}

function allowAdminWrite(collection: string) {
  return it(`${collection} allows admin-claim users to write`, async () => {
    const auth = { uid: "alice", email: "alice@example.com" };
    const db = firebase.initializeTestApp({ projectId, auth: {...auth, admin: true} }).firestore();
    const doc = db.collection(collection).doc();
    await firebase.assertSucceeds(doc.set({ foo: "bar" }));
  });
}

function denyAdminWrite(collection: string) {
  return it(`${collection} denies admin-claim users writing`, async () => {
    const auth = { uid: "alice", email: "alice@example.com" };
    const db = firebase.initializeTestApp({ projectId, auth: {...auth, admin: true} }).firestore();
    const doc = db.collection(collection).doc();
    await firebase.assertFails(doc.set({ foo: "bar" }));
  });
}

describe("Firestore Rules", () => {
  describe("Unauthenticated Reads and Writes", () => {
    collections.forEach((collection) => {
      denyUnauthenticatedReadWrite(collection);
    });
  });

  describe("Authenticated Reads", () => {
    ["Divisions", "Jobs", "TimeTypes", "Profiles"].forEach((collection) => {
      allowAuthenticatedRead(collection);
    });
    ["Config", "RawLogins"].forEach((collection) => {
      denyAuthenticatedRead(collection);
    });
  });

  describe("Authenticated Writes", () => {
    [
      "Computers",
      "Config",
      "Divisions",
      "Jobs",
      "RawLogins",
      "TimeTypes",
    ].forEach((collection) => {
      denyAuthenticatedWrite(collection);
    });
  });

  describe("Admin Reads", () => {
    ["Logins", "Profiles", "RawLogins", "Computers", "Users", "TimeTracking"].forEach((collection) => {
      allowAdminRead(collection);
    });
  });

  describe("Admin Writes", () => {
    ["Divisions", "TimeTypes"].forEach((collection) => {
      allowAdminWrite(collection);
    });
    ["Computers", "Config", "RawLogins"].forEach((collection) => {
      denyAdminWrite(collection);
    });
  });

  describe("RawLogins", () => {
    it("Allows admins to delete stuff", async () => {
      const auth = { uid: "alice", email: "alice@example.com" };
      const db = firebase.initializeTestApp({ projectId, auth: {...auth, admin: true} }).firestore();
      const doc = db.collection("RawLogins").doc();  
      await firebase.assertSucceeds(doc.delete());
    });
    it("Prevents anybody else from deleting stuff", async () => {
      const auth = { uid: "alice", email: "alice@example.com" };
      const db = firebase.initializeTestApp({ projectId, auth }).firestore();
      const doc = db.collection("RawLogins").doc();  
      await firebase.assertFails(doc.delete());
    });
  });

  describe("Profiles", () => {
    const division = { name: "Playtime" };
    const profiles = adminDb.collection("Profiles");
    const divisions = adminDb.collection("Divisions");

    beforeEach("reset data", async () => {
      await firebase.clearFirestoreData({ projectId });
      await profiles.doc("alice").set(alice);
      await profiles.doc("bob").set(bob);
      await divisions.doc("ABC").set(division);
    });

    it("requires a tbtePayrollId to be present", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const doc = db.collection("Profiles").doc("bob");
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: 28,
          defaultDivision: "ABC",
          salary: false,
        })
      );
    });
    it("requires salary to be present and boolean", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const doc = db.collection("Profiles").doc("bob");
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: 28,
          defaultDivision: "ABC",
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: 28,
          defaultDivision: "ABC",
          salary: "string",
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: 28,
          defaultDivision: "ABC",
          salary: false,
        })
      );
    });
    it("requires a tbtePayrollId to be a positive integer or CMS{1,2}", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const doc = db.collection("Profiles").doc("bob");
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: 28.2,
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: -4,
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: "CMS",
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: "CMS2",
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: "CMS22",
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: "CMS222",
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: "BMS22",
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: 28,
          defaultDivision: "ABC",
          salary: false,
        })
      );
    });
    it("requires a referenced manager to be valid", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const doc = db.collection("Profiles").doc("bob");
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "ronswanson",
          tbtePayrollId: 28,
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: 28,
          defaultDivision: "ABC",
          salary: false,
        })
      );
    });
    it("requires a displayName and email", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice", ...alice, admin: true} }).firestore();
      const doc = db.collection("Profiles").doc("bob");
      await firebase.assertFails(
        doc.set({ 
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: 28,
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertFails(
        doc.set({ 
          displayName: "Bob", 
          managerUid: "alice",
          tbtePayrollId: 28,
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertSucceeds(
        doc.set({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: 28,
          defaultDivision: "ABC",
          salary: false,
        })
      );
    });
    it("requires a referenced division to be valid", async() => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const doc = db.collection("Profiles").doc("bob");  
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: 28,
          defaultDivision: "DEF",
          salary: false,
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: 28,
          defaultDivision: "ABC",
          salary: false,
        })
      );

    });
  });

  describe("TimeSheets", () => {
    const timesheet = { uid: "bob", managerUid: "alice", submitted: false, rejected: false, approved: false, locked: false };
    const timesheets = adminDb.collection("TimeSheets");

    beforeEach("reset data", async () => {
      await firebase.clearFirestoreData({ projectId });
      await timesheets.doc("IG022A64Lein7bRiC5HG").set(timesheet);
    });

    it("allows owner to submit timesheets", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, time: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertSucceeds(
        doc.set({ submitted: true }, { merge: true })
      );
    });
    it("allows owner to recall unapproved timesheets", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, time: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertSucceeds(
        doc.set({ submitted: false }, { merge: true })
      );
    });
    it("allows manager (tapr) to read submitted timesheets they manage", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, tapr: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.get());
    });
    it("allows manager (tapr) to approve submitted timesheets they manage", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, tapr: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertSucceeds(
        doc.set({ approved: true }, { merge: true })
      );
    });
    it("allows manager (tapr) to reject submitted timesheets they manage", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, tapr: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertSucceeds(
        doc.set({ rejected: true, rejectionReason: "6chars", approved: false }, { merge: true })
      );
    });
    it("allows manager (tapr) to reject approved timesheets they manage", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true, approved: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, tapr: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertSucceeds(
        doc.set({ rejected: true, rejectionReason: "6chars", approved: false }, { merge: true })
      );
    });
    it("allows time sheet rejector (tsrej) to reject any approved timesheet", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true, approved: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...alice, tsrej: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertSucceeds(
        doc.set({ rejected: true, rejectionReason: "6chars", approved: false }, { merge: true })
      );
    });
    it("prevents manager (tapr) from rejecting locked timesheets they manage", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true, approved:true, locked: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, tapr: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ rejected: true, rejectionReason: "6chars", approved: false }, { merge: true })
      );
    });
    it("prevents rejected timesheets from being submitted", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ rejected: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, time: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ submitted: true }, { merge: true })
      );
    });
    it("prevents submission of timesheets by non-owner", async () => {
      const doc = timeDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ submitted: true }, { merge: true })
      );
    });
    it("prevents recall of timesheets by the manager", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, tapr: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ submitted: false }, { merge: true })
      );
    });
    it("prevents recall of approved timesheets by the owner", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ approved: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, time: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ submitted: false }, { merge: true })
      );
    });
    it("prevents the manager from reading timesheets that aren't submitted", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, tapr: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertFails(doc.get());
    });
    it("prevents rejected timesheets from being approved", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ rejected: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, tapr: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ approved: true }, { merge: true })
      );
    });
    it("prevents manager (tapr) from approving timesheets they do not manage", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, tapr: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ approved: true }, { merge: true })
      );
    });
    it("prevents manager (tapr) from approving unsubmitted timesheets", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, tapr: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ approved: true }, { merge: true })
      );
    });
    it("prevents manager (tapr) from rejecting unsubmitted timesheets they manage", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, tapr: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ rejected: true, rejectionReason: "6chars" }, { merge: true })
      );
    });
    it("prevents manager (tapr) from rejecting timesheets they do not manage", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, tapr: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ rejected: true, rejectionReason: "6chars" }, { merge: true })
      );
    });
    it("prevents non-managers (no tapr) from approving timesheets even if they're listed as manager", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ approved: true }, { merge: true })
      );
    });
    it("prevents non-managers (no tapr) from rejecting timesheets even if they're listed as manager", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ rejected: true, rejectionReason: "6chars" }, { merge: true })
      );
    });
  });

  describe("TimeEntries", () => {
    const divisions = adminDb.collection("Divisions");
    const timetypes = adminDb.collection("TimeTypes");
    const timeentries = adminDb.collection("TimeEntries");
    const jobs = adminDb.collection("Jobs");
    const baseline = { uid: "alice", date: new Date(), timetype: "R", timetypeName: "Hours Worked", division: "ABC", hours: 5, };
    const entryJobProperties = { job: "19-333", jobDescription: "A basic job", client: "A special client" };

    beforeEach("reset data", async () => {
      await firebase.clearFirestoreData({ projectId });
      await divisions.doc("ABC").set({ name: "Playtime" });
      await timetypes.doc("R").set({ name: "Hours Worked" });
      await timetypes.doc("OR").set({ name: "Off Rotation" });
      await timetypes.doc("RB").set({ name: "Add Overtime to Bank" });
      await timetypes.doc("OR").set({ name: "Off Rotation (Full Day)" });
      await timetypes.doc("OTO").set({ name: "Request Overtime Payout" });
      await jobs.doc("19-333").set({ description: "Big job for a client" });
      await timeentries.doc("EF312A64Lein7bRiC5HG").set(baseline);
    });

    it("requires submitted uid to match the authenticated user id", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      await firebase.assertSucceeds(
        doc.set({ uid: "alice", date: new Date(), timetype: "OR", timetypeName: "Off Rotation" })
      );
      await firebase.assertFails(
        doc.set({ uid: "bob", date: new Date(), timetype: "OR", timetypeName: "Off Rotation" })
      );
    });
    it("requires Hours-worked documents to have a valid division", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      await firebase.assertSucceeds(doc.set(baseline));
      const { division, ...missingDivision } = baseline;
      await firebase.assertFails(doc.set(missingDivision));
      await firebase.assertFails(doc.set({ division: "NOTINDB", ...missingDivision }));
    });
    it("requires documents not have unspecified fields", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      await firebase.assertSucceeds(doc.set(baseline));
      await firebase.assertFails(doc.set({ ...baseline, foo: "bar" }));
    });
    it("requires a document's timetype value to reference a valid timetype", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      await firebase.assertSucceeds(doc.set(baseline));
      const { timetype, ...missingTimetype } = baseline;
      await firebase.assertFails(doc.set({ ...missingTimetype, timetype: "NONVALIDTIMETYPE" }));
    });
    it("requires documents with workrecord key to reference a valid job", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      await firebase.assertSucceeds( doc.set({ ...baseline, ...entryJobProperties, workrecord: "K20-420" }) );
      const { job, ...missingJob } = entryJobProperties;
      await firebase.assertFails( doc.set({ ...baseline, ...missingJob, job: "notjob", workrecord: "K20-420" }) );
      await firebase.assertFails( doc.set({ ...baseline, ...missingJob, workrecord: "K20-420" }) );
    });
    it("requires documents with jobHours key to reference a valid job", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      const { job, ...missingJob } = entryJobProperties;
      const { hours, ...missingHours } = baseline;
      await firebase.assertSucceeds( doc.set({ ...missingHours, ...entryJobProperties, jobHours: 5 }) );
      await firebase.assertFails( doc.set({ ...missingHours, ...missingJob, job: "notjob", jobHours: 5 }) );
      await firebase.assertFails( doc.set({ ...missingHours, ...missingJob, jobHours: 5 }) );
    });
    it("requires hours, jobHours, and mealsHours to be positive real numbers under 18", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      const { hours, ...missingHours } = baseline;
      await firebase.assertSucceeds(doc.set({ ...missingHours, ...entryJobProperties, jobHours: 5}));
      await firebase.assertFails(doc.set({ ...missingHours, ...entryJobProperties, jobHours: 19}));
      await firebase.assertFails(doc.set({ ...missingHours, ...entryJobProperties, jobHours: -1}));
      await firebase.assertFails(doc.set({ ...missingHours, ...entryJobProperties, jobHours: "duck"}));
      await firebase.assertSucceeds(doc.set({ ...missingHours, hours: 5}));
      await firebase.assertFails(doc.set({ ...missingHours, hours: 19}));
      await firebase.assertFails(doc.set({ ...missingHours, hours: -1}));
      await firebase.assertFails(doc.set({ ...missingHours, hours: "duck"}));
      await firebase.assertSucceeds(doc.set({ ...missingHours, ...entryJobProperties, mealsHours: 1}));
      await firebase.assertFails(doc.set({ ...missingHours, ...entryJobProperties, mealsHours: 19}));
      await firebase.assertFails(doc.set({ ...missingHours, ...entryJobProperties, mealsHours: -1}));
      await firebase.assertFails(doc.set({ ...missingHours, ...entryJobProperties, mealsHours: "duck"}));
    });
    it("requires a referenced job to be valid", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      const { job, ...missingJob } = entryJobProperties;
      await firebase.assertSucceeds(doc.set({ ...baseline, ...missingJob, job:"19-333" }));
      await firebase.assertFails(doc.set({ ...baseline, ...missingJob, job:"20-333" }));
    });
    it("requires workrecords to match the correct format", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      await firebase.assertSucceeds( doc.set({ ...baseline, ...entryJobProperties, workrecord: "Q20-423" }) );
      await firebase.assertSucceeds( doc.set({ ...baseline, ...entryJobProperties, workrecord: "K20-423-1" }) );
      await firebase.assertFails( doc.set({ ...baseline, ...entryJobProperties, workrecord: "F18-33-1" }) );
      await firebase.assertFails( doc.set({ ...baseline, ...entryJobProperties, workrecord: "asdf" }) );
    });
    it("requires jobHours not be present if there is no job", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      await firebase.assertSucceeds(doc.set({ ...baseline, ...entryJobProperties, jobHours: 5 }));
      await firebase.assertFails(doc.set({ ...baseline, jobHours: 5 }));
    });
    it("allows owner to read their own Time Entries if they have time claim", async () => {
      const doc = timeDb.collection("TimeEntries").doc("EF312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.get())
    });
    it("prevents owner from reading their own Time Entries if they have no time claim", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice } }).firestore();
      const doc = db.collection("TimeEntries").doc("EF312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.get())
    });
    it("prevents time users from reading Time Entries that do not belong to them", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, time: true } }).firestore();
      const doc = db.collection("TimeEntries").doc("EF312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.get())
    });
    it("requires banking entries (RB) to have only uid, date, timetype, timetypeName, hours", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      await firebase.assertSucceeds(doc.set({ uid: "alice", date: new Date(), timetype: "RB", timetypeName: "Add Overtime to Bank", hours: 5, }));
      await firebase.assertFails(doc.set({ uid: "alice", date: new Date(), timetype: "RB", timetypeName: "Add Overtime to Bank", hours: 5, division: "ABC"}));
    });
    it("requires off-rotation entries (OR) to have only uid, date, timetype, timetypeName", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      await firebase.assertSucceeds(doc.set({ uid: "alice", date: new Date(), timetype: "OR", timetypeName: "Add Overtime to Bank" }));
      await firebase.assertFails(doc.set({ uid: "alice", date: new Date(), timetype: "OR", timetypeName: "Add Overtime to Bank", hours: 5 }));
      await firebase.assertFails(doc.set({ uid: "alice", date: new Date(), timetype: "OR", timetypeName: "Add Overtime to Bank", jobHours: 5 }));
      await firebase.assertFails(doc.set({ uid: "alice", date: new Date(), timetype: "OR", timetypeName: "Add Overtime to Bank", mealsHours: 5 }));
    });
    it("requires overtime payout entries (OTO) to have only uid, date, timetype, timetypeName, payoutRequestAmount", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      await firebase.assertSucceeds(doc.set({ uid: "alice", date: new Date(), timetype: "OTO", timetypeName: "Request Overtime Payout", payoutRequestAmount: 254.4 }));
      await firebase.assertFails(doc.set({ uid: "alice", date: new Date(), timetype: "OTO", timetypeName: "Request Overtime Payout", hours: 5 }));
      await firebase.assertFails(doc.set({ uid: "alice", date: new Date(), timetype: "OTO", timetypeName: "Request Overtime Payout" }));
    });
  });
  
  describe("Jobs", () => {
    const job = { description: "A basic job", client: "A special client", manager: "A company employee" };
    const jobs = adminDb.collection("Jobs");

    beforeEach("reset data", async () => {
      await firebase.clearFirestoreData({ projectId });
      await jobs.doc("19-444").set(job);
      await jobs.doc("P19-444").set(job);
    });

    it("allows job claim holders to create or update", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const doc = db.collection("Jobs").doc("19-333");
      await firebase.assertSucceeds(doc.set(job));
      const { manager, ...noManager } = job;
      await firebase.assertSucceeds(doc.update({ ...noManager, manager: "A different employee" }));
    });
    it("prevents job claim holders from creating jobs with invalid ID format", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const doc = db.collection("Jobs").doc("invalidIdFormat");
      await firebase.assertFails(doc.set(job));
    });
    it("prevents users without job claim from creating or updating", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice } }).firestore();
      const doc = db.collection("Jobs").doc("19-333");
      await firebase.assertFails(doc.set(job));
    });
    it("prevents the description from being less than 4 characters long", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const doc = db.collection("Jobs").doc("19-333");
      await firebase.assertSucceeds(doc.set(job));
      const { description, ...noDescription } = job;
      await firebase.assertFails(doc.update({ ...noDescription, description: "not" }));
    });
    it("requires the proposal to reference a valid job if present", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const doc = db.collection("Jobs").doc("19-333");
      await firebase.assertSucceeds(doc.set({ ...job, proposal: "P19-444"}));
      await firebase.assertSucceeds(doc.set({ ...job }));
      await firebase.assertFails(doc.set({ ...job, proposal: "P19-555"}));
    });
  });
  describe("TimeAmendments", () => {
    it("allows time administrators (tadm) to read");
    it("allows time administrators (tadm) to create valid amendments");
    it("allows time administrators (tadm) to update valid uncommitted amendments");
    it("allows time administrators (tadm) to commit amendments");
    it("allows time administrators (tadm) to delete uncommitted amendments");
    it("prevents time administrators (tadm) from creating invalid amendments");
    it("prevents time administrators (tadm) from deleting committed amendments");
    it("prevents admins from creating, reading, updating, or deleting amendments");
  });
  describe("Expenses", () => {
    const expenses = adminDb.collection("Expenses");
    const divisions = adminDb.collection("Divisions");
    const jobs = adminDb.collection("Jobs");
    const baseline = { uid: "alice", displayName: "Alice Example", surname: "Example", givenName: "Alice", date: new Date(), total: 50, description: "Monthly recurring expense", submitted: false, approved: false, managerUid: "bob", managerName: "Bob Example", division: "ABC", divisionName: "Playtime", paymentType: "Expense" };
    const expenseJobProperties = { job: "19-333", jobDescription: "A basic job", client: "A special client" };
    const division = { name: "Playtime" };

    beforeEach("reset data", async () => {
      await firebase.clearFirestoreData({ projectId });
      await jobs.doc("19-333").set({ description: "Big job for a client" });
      await expenses.doc("F3312A64Lein7bRiC5HG").set(baseline);
      await divisions.doc("ABC").set(division);
    });

    it("allows owner to read their own Expenses if they have time claim", async () => {
      const doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.get())
    });
    it("allows owner to delete their own Expenses if they have time claim", async () => {
      const doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.delete())
    });
    it("allows owner to recall unapproved Expenses and prevents recall of approved ones", async () => {
      // unapproved
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true });
      const doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.update({ submitted: false }));
      // approved
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true });
      await firebase.assertFails(doc.update({ submitted: false }));
    });

    it("allows manager (tapr) to read submitted Expenses they manage", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, tapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.get());
    });
    it("allows manager (eapr) to read any approved Expenses", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, managerUid: "alice" });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, eapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.get());
    });
    it("allows expense rejector (erej) to read any approved Expenses", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, managerUid: "alice" });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, erej: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.get());
    });
    it("allows expense rejector (erej) to reject any approved Expense", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, committed: false });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, erej: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(
        doc.set({ rejected: true, rejectionReason: "6chars", approved: false }, { merge: true })
      );
    });
    it("prevents owner from deleting their own Expenses if they are submitted", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true });
      const doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.delete())
    });
    it("prevents owner from deleting their own Expenses if they are approved", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true });
      const doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.delete())
    });
    it("prevents manager from deleting Expenses they manage", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, tapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.delete())
    });
    it("prevents owner from reading their own Expenses if they have no time claim", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.get())
    });
    it("prevents manager (tapr) from reading submitted Expenses they do not manage", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, managerUid: "alice" });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, tapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.get());
    });
    it("prevents user with managerUid from reading submitted Expenses if they are missing tapr claim", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.get());
    });
    it("prevents manager (tapr) from reading unsubmitted Expenses they manage", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, tapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.get());
    });
    it("prevents manager (eapr) from reading unapproved Expenses", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, managerUid: "alice" });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, eapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.get());
    });
    it("requires submitted uid to match the authenticated user id", async () => {
      const doc = timeDb.collection("Expenses").doc();
      await firebase.assertSucceeds(doc.set(baseline));
      const { uid, ...missingUid } = baseline;
      await firebase.assertFails(doc.set({ uid: "bob", ...missingUid }));
    });
    it("requires documents not have unspecified fields", async () => {
      const doc = timeDb.collection("Expenses").doc();
      await firebase.assertSucceeds(doc.set(baseline));
      await firebase.assertFails(doc.set({ ...baseline, foo: "bar" }));
    });
    it("requires any referenced job to be valid", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { job, ...missingJob } = expenseJobProperties;
      await firebase.assertSucceeds(doc.set({ ...baseline, ...missingJob, job:"19-333" }));
      await firebase.assertFails(doc.set({ ...baseline, ...missingJob, job:"20-333" }));
    });
    it("requires division to be present and valid", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { division, ...missingDivision } = baseline;
      await firebase.assertFails(doc.set(missingDivision));
      await firebase.assertFails(doc.set({ division: "DEF", ...missingDivision }));
      await firebase.assertSucceeds(doc.set({ division: "ABC", ...missingDivision }));
    });
    it("requires paymentType to be either CorporateCreditCard or Expense", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, ...missingPaymentType } = baseline;
      await firebase.assertFails(doc.set(missingPaymentType));
      await firebase.assertFails(doc.set({ paymentType: "DEF", ...missingPaymentType }));
      await firebase.assertSucceeds(doc.set({ paymentType: "CorporateCreditCard", ...missingPaymentType }));
      await firebase.assertSucceeds(doc.set({ paymentType: "Expense", ...missingPaymentType }));
    });
    it("allows documents to have vendorName field", async () => {
      const doc = timeDb.collection("Expenses").doc();
      await firebase.assertSucceeds(doc.set(baseline));
      await firebase.assertSucceeds(doc.set({ ...baseline, vendorName: "Foobar Company" }));
    });
    it("allows manager (tapr) to reject submitted expenses they manage", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: false });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, tapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(
        doc.set({ rejected: true, rejectionReason: "6chars", approved: false }, { merge: true })
      );

    });
  });
  //wtf.dump()
});
