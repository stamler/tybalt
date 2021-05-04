import * as firebase from "@firebase/rules-unit-testing";
import "mocha";
import { addDays, subDays } from "date-fns";

const projectId = "test-app-id";

const alice = { displayName: "Alice Example", timeSheetExpected: false, email: "alice@example.com", personalVehicleInsuranceExpiry: addDays(new Date(), 7), salary: false, tbtePayrollId: 28 };
const bob = { displayName: "Bob Example", email: "bob@example.com", timeSheetExpected: true };
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
  "ProfileSecrets",
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

describe("Firestore Rules", function () {
  this.timeout(3000);
  describe("Unauthenticated Reads and Writes", () => {
    collections.forEach((collection) => {
      denyUnauthenticatedReadWrite(collection);
    });
  });

  describe("Authenticated Reads", () => {
    ["Divisions", "Jobs", "TimeTypes"].forEach((collection) => {
      allowAuthenticatedRead(collection);
    });
    ["Config", "RawLogins", "ProfileSecrets", "Profiles"].forEach((collection) => {
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
      "ProfileSecrets",
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
    ["Computers", "Config", "ProfileSecrets", "RawLogins"].forEach((collection) => {
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

  describe("ProfileSecrets", () => {
    const profileSecrets = adminDb.collection("ProfilesSecrets");
    beforeEach("reset data", async () => {
      await firebase.clearFirestoreData({ projectId });
      await profileSecrets.doc("alice").set({ secret: "foo" });
      await profileSecrets.doc("bob").set({ secret: "bar" });
    });

    it("grants read access if requesting uid matches the document ID", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice } }).firestore();
      const doc = db.collection("ProfileSecrets").doc("alice");
      await firebase.assertSucceeds(doc.get());
    });
    it("reject read access if requesting uid does not match the document ID", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice } }).firestore();
      const doc = db.collection("ProfileSecrets").doc("bob");
      await firebase.assertFails(doc.get());
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

    it("allows a user to read their own profile", async () => {
      const doc = timeDb.collection("Profiles").doc("alice");
      await firebase.assertSucceeds(doc.get());
    });
    it("prevents a user from reading someone else's profile", async () => {
      const doc = timeDb.collection("Profiles").doc("bob");
      await firebase.assertFails(doc.get());
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
    it("requires personalVehicleInsuranceExpiry to be Timestamp or missing", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const doc = db.collection("Profiles").doc("bob");
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: 28,
          defaultDivision: "ABC",
          salary: false,
          personalVehicleInsuranceExpiry: "not a date",
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: 28,
          defaultDivision: "ABC",
          salary: false,
          personalVehicleInsuranceExpiry: 6,
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
          personalVehicleInsuranceExpiry: new Date(),
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
          personalVehicleInsuranceExpiry: firebase.firestore.FieldValue.delete()
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
    it("requires a displayName and email and boolean timeSheetExpected", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice", ...alice, admin: true} }).firestore();
      const doc = db.collection("Profiles").doc("bob");
      await firebase.assertFails(
        doc.set({ 
          timeSheetExpected: true,
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: 28,
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertFails(
        doc.set({ 
          timeSheetExpected: true,
          displayName: "Bob", 
          managerUid: "alice",
          tbtePayrollId: 28,
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertFails(
        doc.set({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: 28,
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertFails(
        doc.set({
          timeSheetExpected: "foo",
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: 28,
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertSucceeds(
        doc.set({
          timeSheetExpected: true,
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
    it("allows report claim holder to read any locked timesheets", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ locked: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, report: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.get());
    });
    it("prevents report claim holder from reading unlocked timesheets", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, report: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertFails(doc.get());
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
        doc.set({ rejected: true, rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
    });
    it("allows manager (tapr) to reject approved timesheets they manage", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true, approved: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, tapr: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertSucceeds(
        doc.set({ rejected: true, rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
    });
    it("allows time sheet rejector (tsrej) to reject any approved timesheet", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true, approved: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...alice, tsrej: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertSucceeds(
        doc.set({ rejected: true, rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
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
    const profiles = adminDb.collection("Profiles");
    const baseline = { uid: "alice", date: new Date(), timetype: "R", timetypeName: "Hours Worked", division: "ABC", hours: 5, workDescription: "5char" };
    const entryJobProperties = { job: "19-333", jobDescription: "A basic job", client: "A special client" };

    beforeEach("reset data", async () => {
      await firebase.clearFirestoreData({ projectId });
      await divisions.doc("ABC").set({ name: "Playtime" });
      await timetypes.doc("R").set({ name: "Hours Worked" });
      await timetypes.doc("RT").set({ name: "Training" });
      await timetypes.doc("OH").set({ name: "Statutory Holiday" });
      await timetypes.doc("OP").set({ name: "PPTO" });
      await timetypes.doc("OR").set({ name: "Off Rotation" });
      await timetypes.doc("RB").set({ name: "Add Overtime to Bank" });
      await timetypes.doc("OR").set({ name: "Off Rotation (Full Day)" });
      await timetypes.doc("OTO").set({ name: "Request Overtime Payout" });
      await jobs.doc("19-333").set({ description: "A basic job", client: "A special client" });
      await timeentries.doc("EF312A64Lein7bRiC5HG").set(baseline);
      await profiles.doc("alice").set(alice);
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
    it("requires date to be a date timestamp", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      const { date, ...missingDate } = baseline;
      await firebase.assertFails(doc.set({date: "foo", ...missingDate }));
      await firebase.assertSucceeds(doc.set(baseline));
    });
    it("requires description to be missing if timetype is OR, RB, or OTO", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      await firebase.assertFails(doc.set({ uid: "alice", date: new Date(), timetype: "OR", timetypeName: "Off Rotation", workDescription: "5char" }));
      await firebase.assertSucceeds(doc.set({ uid: "alice", date: new Date(), timetype: "OR", timetypeName: "Off Rotation" }));
      await firebase.assertFails(doc.set({ uid: "alice", date: new Date(), timetype: "RB", timetypeName: "Add Overtime to Bank", hours: 5, workDescription: "5char"  }));
      await firebase.assertSucceeds(doc.set({ uid: "alice", date: new Date(), timetype: "RB", timetypeName: "Add Overtime to Bank", hours: 5, }));
      await firebase.assertFails(doc.set({ uid: "alice", date: new Date(), timetype: "OTO", timetypeName: "Request Overtime Payout", payoutRequestAmount: 254.4, workDescription: "5char" }));
      await firebase.assertSucceeds(doc.set({ uid: "alice", date: new Date(), timetype: "OTO", timetypeName: "Request Overtime Payout", payoutRequestAmount: 254.4 }));
    });
    it("requires description longer than 4 chars if timetype is R or RT", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      const { workDescription, timetype, ...missingDescriptionAndTimetype } = baseline;
      await firebase.assertFails(doc.set({timetype: "R",...missingDescriptionAndTimetype}));
      await firebase.assertFails(doc.set({timetype: "R", workDescription: "four",...missingDescriptionAndTimetype}));
      await firebase.assertSucceeds(doc.set({timetype: "R", workDescription: "5char",...missingDescriptionAndTimetype}));
      await firebase.assertFails(doc.set({timetype: "RT",...missingDescriptionAndTimetype}));
      await firebase.assertFails(doc.set({timetype: "RT", workDescription: "four",...missingDescriptionAndTimetype}));
      await firebase.assertSucceeds(doc.set({timetype: "RT", workDescription: "5char",...missingDescriptionAndTimetype}));
    });
    it("allows optional descriptions for other timetypes", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      await firebase.assertSucceeds(doc.set({ uid: "alice", date: new Date(), timetype: "OH", timetypeName: "Statutory Holiday", hours: 5, }));
      await firebase.assertSucceeds(doc.set({ uid: "alice", date: new Date(), timetype: "OP", timetypeName: "Statutory Holiday", hours: 5, }));
      await firebase.assertSucceeds(doc.set({ uid: "alice", date: new Date(), timetype: "OH", timetypeName: "Statutory Holiday", hours: 5, workDescription: "5char"}));
      await firebase.assertSucceeds(doc.set({ uid: "alice", date: new Date(), timetype: "OP", timetypeName: "Statutory Holiday", hours: 5, workDescription: "5char"}));
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
    it("rejects entries where only hours are mealsHours", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      const { hours, ...missingHours } = baseline;
      await firebase.assertFails(doc.set({ ...missingHours, ...entryJobProperties, mealsHours: 5}));
      await firebase.assertSucceeds(doc.set({ ...missingHours, ...entryJobProperties, mealsHours: 0.5, hours: 5}));
    });
    it("requires hours, jobHours, and mealsHours to be positive multiples of 0.5 under 18", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      const { hours, ...missingHours } = baseline;
      await firebase.assertSucceeds(doc.set({ ...missingHours, ...entryJobProperties, jobHours: 5}));
      await firebase.assertSucceeds(doc.set({ ...missingHours, ...entryJobProperties, jobHours: 5.5}));
      await firebase.assertFails(doc.set({ ...missingHours, ...entryJobProperties, jobHours: 5.6}));
      await firebase.assertFails(doc.set({ ...missingHours, ...entryJobProperties, jobHours: 19}));
      await firebase.assertFails(doc.set({ ...missingHours, ...entryJobProperties, jobHours: -1}));
      await firebase.assertFails(doc.set({ ...missingHours, ...entryJobProperties, jobHours: "duck"}));
      await firebase.assertSucceeds(doc.set({ ...missingHours, hours: 5}));
      await firebase.assertSucceeds(doc.set({ ...missingHours, hours: 5.5}));
      await firebase.assertFails(doc.set({ ...missingHours, hours: 5.6}));
      await firebase.assertFails(doc.set({ ...missingHours, hours: 19}));
      await firebase.assertFails(doc.set({ ...missingHours, hours: -1}));
      await firebase.assertFails(doc.set({ ...missingHours, hours: "duck"}));
      await firebase.assertSucceeds(doc.set({ ...missingHours, ...entryJobProperties, hours:4, mealsHours: 1}));
      await firebase.assertSucceeds(doc.set({ ...missingHours, ...entryJobProperties, hours:4, mealsHours: 0.5}));
      await firebase.assertFails(doc.set({ ...missingHours, ...entryJobProperties, hours:4, mealsHours: 0.6}));
      await firebase.assertFails(doc.set({ ...missingHours, ...entryJobProperties, hours:4, mealsHours: 19}));
      await firebase.assertFails(doc.set({ ...missingHours, ...entryJobProperties, hours:4, mealsHours: -1}));
      await firebase.assertFails(doc.set({ ...missingHours, ...entryJobProperties, hours:4, mealsHours: "duck"}));
    });
    it("requires a referenced job to be valid", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      const { job, ...missingJob } = entryJobProperties;
      await firebase.assertSucceeds(doc.set({ ...baseline, ...missingJob, job:"19-333" }));
      await firebase.assertFails(doc.set({ ...baseline, ...missingJob, job:"20-333" }));
    });
    it("requires jobDescription and client to match a referenced job's respective properties", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      const { jobDescription, ...missingJobDescription } = entryJobProperties;
      const { client, ...missingClient } = entryJobProperties;
      await firebase.assertFails(doc.set({ ...baseline, ...missingJobDescription, jobDescription:"Non-matching description" }));
      await firebase.assertFails(doc.set({ ...baseline, ...missingClient, client:"Non-matching client" }));
      await firebase.assertSucceeds(doc.set({ ...baseline, ...entryJobProperties }));
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
      await firebase.assertFails(doc.set({ uid: "alice", date: new Date(), timetype: "OR", timetypeName: "Add Overtime to Bank", workDescription: "Valid Description" }));
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
    it("prevents RB (banking) entries from being created for staff with salary:true on their profile", async () => {
      const doc = timeDb.collection("TimeEntries").doc();      
      await firebase.assertSucceeds(doc.set({ uid: "alice", date: new Date(), timetype: "RB", timetypeName: "Add Overtime to Bank", hours: 5, }));
      // TODO: set profile salary: true here
      const { salary, ...missingSalary } = alice;
      await profiles.doc("alice").set({ salary: true, ...missingSalary });
      await firebase.assertFails(doc.set({ uid: "alice", date: new Date(), timetype: "RB", timetypeName: "Add Overtime to Bank", hours: 5, }));
    });
  });
  
  describe("Jobs", () => {
    const job = { description: "A basic job", client: "A special client", manager: "A company employee", status: "Active" };
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
    it("restricts value of status for projects", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const doc = db.collection("Jobs").doc("19-333");
      const {status, ...noStatus} = job;
      await firebase.assertFails(doc.set({ status: "Awarded", ...noStatus}));
      await firebase.assertFails(doc.set({ status: "Not Awarded", ...noStatus}));
      await firebase.assertSucceeds(doc.set({ status: "Active", ...noStatus}));
      await firebase.assertSucceeds(doc.set({ status: "Closed", ...noStatus}));
      await firebase.assertSucceeds(doc.set({ status: "Cancelled", ...noStatus}));
    });
    it("restricts value of status for proposals", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const doc = db.collection("Jobs").doc("P19-333");
      const {status, ...noStatus} = job;
      await firebase.assertFails(doc.set({ status: "Closed", ...noStatus}));
      await firebase.assertSucceeds(doc.set({ status: "Active", ...noStatus}));
      await firebase.assertSucceeds(doc.set({ status: "Not Awarded", ...noStatus}));
      await firebase.assertSucceeds(doc.set({ status: "Awarded", ...noStatus}));
      await firebase.assertSucceeds(doc.set({ status: "Cancelled", ...noStatus}));
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
    it("allows time administrators (tame) to read");
    it("allows time administrators (tame) to create valid amendments");
    it("allows time administrators (tame) to update valid uncommitted amendments");
    it("allows time administrators (tame) to commit amendments");
    it("allows time administrators (tame) to delete uncommitted amendments");
    it("prevents time administrators (tame) from creating invalid amendments");
    it("prevents time administrators (tame) from deleting committed amendments");
    it("prevents admins from creating, reading, updating, or deleting amendments");
  });
  describe("Expenses", () => {
    const expenses = adminDb.collection("Expenses");
    const divisions = adminDb.collection("Divisions");
    const profiles = adminDb.collection("Profiles");
    const jobs = adminDb.collection("Jobs");
    const baseline = { uid: "alice", displayName: "Alice Example", surname: "Example", givenName: "Alice", date: new Date(), total: 50, description: "Monthly recurring expense", submitted: false, approved: false, managerUid: "bob", managerName: "Bob Example", division: "ABC", divisionName: "Playtime", paymentType: "Expense", attachment: "foo", tbtePayrollId: 28 };
    const expenseJobProperties = { job: "19-333", jobDescription: "A basic job", client: "A special client" };
    const division = { name: "Playtime" };

    beforeEach("reset data", async () => {
      await firebase.clearFirestoreData({ projectId });
      await jobs.doc("19-333").set({ description: "Big job for a client" });
      await expenses.doc("F3312A64Lein7bRiC5HG").set(baseline);
      await divisions.doc("ABC").set(division);
      await profiles.doc("alice").set(alice);
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
    it("prevents manager (tapr) from approving Expenses they do not manage", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true });
      let db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, tapr: true } }).firestore();
      let doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(
        doc.set({ approved: true, committed: false }, { merge: true })
      );
      db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...bob, tapr: true } }).firestore();
      doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ approved: true, committed: false }, { merge: true })
      );
    });
    it("prevents manager (tapr) from approving unsubmitted Expenses", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, tapr: true } }).firestore();
      let doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ approved: true, committed: false }, { merge: true })
      );
    });

    it("allows manager (eapr) to read any approved Expenses", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, managerUid: "alice" });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, eapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.get());
    });
    it("allows report claim holder to read any committed Expenses", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, managerUid: "alice", committed: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, report: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.get());
    });
    it("prevents report claim holder from reading any unsubmitted Expenses", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: false, approved: false, managerUid: "alice", committed: false });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, report: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.get());
    });
    it("allows report claim holder to read any submitted Expenses", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: false, managerUid: "alice", committed: false });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, report: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.get());
    });
    it("allows expense rejector (erej) to read any approved Expenses", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, managerUid: "alice" });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, erej: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.get());
    });
    it("allows expense rejector (erej) to reject any approved Expense, but not unapproved", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...alice, erej: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: false, approved: false, committed: false });
      await firebase.assertFails(
        doc.set({ rejected: true, rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: false, committed: false });
      await firebase.assertFails(
        doc.set({ rejected: true, rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, committed: false });
      await firebase.assertSucceeds(
        doc.set({ rejected: true, rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
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
    it("rejects Mileage Expenses where the user doesn't have valid personal car insurance on their profile", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, attachment, total,...missingPaymentTypeAndAttachmentAndTotal } = baseline;
      await firebase.assertSucceeds(doc.set({ paymentType: "Mileage", distance: 5, ...missingPaymentTypeAndAttachmentAndTotal }));
      const { personalVehicleInsuranceExpiry, ...missingPersonalVehicleInsuranceExpiry } = alice;
      await profiles.doc("alice").set({personalVehicleInsuranceExpiry: subDays(new Date(), 7), ...missingPersonalVehicleInsuranceExpiry});
      await firebase.assertFails(doc.set({ paymentType: "Mileage", distance: 5, ...missingPaymentTypeAndAttachmentAndTotal }));
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
    it("requires total to be positive number if paymentType is not Mileage", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, total, ...missingPaymentTypeAndTotal } = baseline;
      await firebase.assertFails(doc.set({paymentType: "Expense",...missingPaymentTypeAndTotal}));
      await firebase.assertFails(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", ...missingPaymentTypeAndTotal}));
      await firebase.assertFails(doc.set({paymentType: "CorporateCreditCard", ccLast4digits: "1234",...missingPaymentTypeAndTotal}));
      await firebase.assertFails(doc.set({paymentType: "Expense", total: -50.5, ...missingPaymentTypeAndTotal}));
      await firebase.assertSucceeds(doc.set({paymentType: "Expense", total: 50.5, ...missingPaymentTypeAndTotal}));
      await firebase.assertSucceeds(doc.set({paymentType: "CorporateCreditCard", ccLast4digits: "1234", total: 50.5, ...missingPaymentTypeAndTotal}));
      await firebase.assertSucceeds(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", total: 50.5, ...missingPaymentTypeAndTotal}));
    });
    it("requires attachment if paymentType is either CorporateCreditCard or FuelCard", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, attachment, ...missingPaymentTypeAndAttachment } = baseline;
      await firebase.assertFails(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", ...missingPaymentTypeAndAttachment}));
      await firebase.assertFails(doc.set({paymentType: "CorporateCreditCard", ccLast4digits: "1234", ...missingPaymentTypeAndAttachment}));
      await firebase.assertSucceeds(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", attachment: "foo", ...missingPaymentTypeAndAttachment}));
      await firebase.assertSucceeds(doc.set({paymentType: "CorporateCreditCard", ccLast4digits: "1234", attachment: "foo", ...missingPaymentTypeAndAttachment}));
    });
    it("requires ccLast4digits be 4 character number-only string if paymentType is either CorporateCreditCard or FuelCard", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, ...missingPaymentType } = baseline;
      await firebase.assertFails(doc.set({paymentType: "FuelCard", ...missingPaymentType }));
      await firebase.assertFails(doc.set({paymentType: "CorporateCreditCard", ...missingPaymentType }));
      await firebase.assertSucceeds(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", ...missingPaymentType }));
      await firebase.assertSucceeds(doc.set({paymentType: "CorporateCreditCard", ccLast4digits: "5678", ...missingPaymentType }));
    });
    it("requires ccLast4digits be missing if paymentType is not CorporateCreditCard or FuelCard", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, ...missingPaymentType } = baseline;
      await firebase.assertFails(doc.set({paymentType: "Expense", ccLast4digits: "1234", ...missingPaymentType }));
      await firebase.assertSucceeds(doc.set({paymentType: "Expense", ...missingPaymentType }));
    });
    it("requires paymentType to be either CorporateCreditCard or Expense or Mileage or FuelCard", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, ...missingPaymentType } = baseline;
      const { total, ...missingPaymentTypeAndTotal } = missingPaymentType;
      const { attachment, ...missingPaymentTypeAndTotalAndAttachment } = missingPaymentTypeAndTotal;
      await firebase.assertFails(doc.set(missingPaymentType));
      await firebase.assertFails(doc.set({ paymentType: "DEF", ...missingPaymentType }));
      await firebase.assertSucceeds(doc.set({ paymentType: "Mileage", distance: 5, ...missingPaymentTypeAndTotalAndAttachment }));
      await firebase.assertSucceeds(doc.set({ paymentType: "CorporateCreditCard", ccLast4digits: "1234", ...missingPaymentType }));
      await firebase.assertSucceeds(doc.set({ paymentType: "FuelCard", ccLast4digits: "1234", ...missingPaymentType }));
      await firebase.assertSucceeds(doc.set({ paymentType: "Expense", ...missingPaymentType }));
    });
    it("requires distance to be integer > 0 if paymentType is Mileage", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, total, attachment, ...missingPaymentTypeAndTotalAndAttachment } = baseline;
      await firebase.assertSucceeds(doc.set({ paymentType: "Mileage", distance: 5, ...missingPaymentTypeAndTotalAndAttachment }));
      await firebase.assertFails(doc.set({ paymentType: "Mileage", distance: -1, ...missingPaymentTypeAndTotalAndAttachment }));
      await firebase.assertFails(doc.set({ paymentType: "Mileage", distance: 0.5, ...missingPaymentTypeAndTotalAndAttachment }));
      await firebase.assertFails(doc.set({ paymentType: "Mileage", distance: "foo", ...missingPaymentTypeAndTotalAndAttachment }));
      await firebase.assertFails(doc.set({ paymentType: "Mileage", ...missingPaymentTypeAndTotalAndAttachment }));
    });
    it("requires po, vendorName, attachment, total to be missing if paymentType is Mileage", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, total, attachment, ...missingPaymentTypeAndTotalAndAttachment } = baseline;
      await firebase.assertSucceeds(doc.set({ paymentType: "Mileage", distance: 5, ...missingPaymentTypeAndTotalAndAttachment }));
      await firebase.assertFails(doc.set({ paymentType: "Mileage", distance: 5, po: "foo", ...missingPaymentTypeAndTotalAndAttachment }));
      await firebase.assertFails(doc.set({ paymentType: "Mileage", distance: 5, vendorName: "foo", ...missingPaymentTypeAndTotalAndAttachment }));
      await firebase.assertFails(doc.set({ paymentType: "Mileage", distance: 5, attachment: "foo", ...missingPaymentTypeAndTotalAndAttachment }));
      await firebase.assertFails(doc.set({ paymentType: "Mileage", distance: 5, total: 55, ...missingPaymentTypeAndTotalAndAttachment }));
    });
    it("requires distance to missing if paymentType is not Mileage", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, ...missingPaymentType } = baseline;
      await firebase.assertSucceeds(doc.set({ paymentType: "Expense", ...missingPaymentType}));
      await firebase.assertFails(doc.set({ paymentType: "Expense", distance: 5, ...missingPaymentType}));
    });
    it("allows documents to have vendorName field", async () => {
      const doc = timeDb.collection("Expenses").doc();
      await firebase.assertSucceeds(doc.set(baseline));
      await firebase.assertSucceeds(doc.set({ ...baseline, vendorName: "Foobar Company" }));
    });
    it("allows manager (tapr) to reject submitted expenses they manage", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: false });
      let db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...bob, tapr: true } }).firestore();
      let doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ rejected: true, rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
      db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, tapr: true } }).firestore();
      doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(
        doc.set({ rejected: true, rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
    });
    it("allows manager (eapr) to commit approved expenses", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, managerUid: "alice" });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, eapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.update({ 
        committed: true,
        commitTime: firebase.firestore.FieldValue.serverTimestamp(),
        commitUid: "bob",
        commitName: "Bob Example",
      }));
    });
    it("prevents manager (eapr) from committing approved expenses if writing a UID other than their own", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, managerUid: "alice" });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, eapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.update({ 
        committed: true,
        commitTime: firebase.firestore.FieldValue.serverTimestamp(),
        commitUid: "alice",
        commitName: "Bob Example",
      }));
      await firebase.assertSucceeds(doc.update({ 
        committed: true,
        commitTime: firebase.firestore.FieldValue.serverTimestamp(),
        commitUid: "bob",
        commitName: "Bob Example",
      }));
    });
    it("prevents manager (eapr) from committing unapproved expenses", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: false, managerUid: "alice" });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, eapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.update({ 
        committed: true,
        commitTime: firebase.firestore.FieldValue.serverTimestamp(),
        commitUid: "bob",
        commitName: "Bob Example",
      }));
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, managerUid: "alice" });
      await firebase.assertSucceeds(doc.update({ 
        committed: true,
        commitTime: firebase.firestore.FieldValue.serverTimestamp(),
        commitUid: "bob",
        commitName: "Bob Example",
      }));

    });
    it("prevents manager (eapr) from rejecting unapproved expenses", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: false, managerUid: "alice" });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, eapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.update({
        approved: false,
        submitted: false,
        rejected: true,
        rejectionReason: "no reason given",
      }));
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, managerUid: "alice" });
      await firebase.assertSucceeds(doc.update({
        approved: false,
        submitted: false,
        rejected: true,
        rejectionReason: "no reason given",
      }));
    });
    it("prevents manager (eapr) from committing approved expenses with date in the future", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ date: addDays(new Date(), 1) , submitted: true, approved: true, managerUid: "alice" });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, eapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.update({ 
        committed: true,
        commitTime: firebase.firestore.FieldValue.serverTimestamp(),
        commitUid: "bob",
        commitName: "Bob Example",
      }));
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ date: subDays(new Date(), 1) , submitted: true, approved: true, managerUid: "alice" });
      await firebase.assertSucceeds(doc.update({ 
        committed: true,
        commitTime: firebase.firestore.FieldValue.serverTimestamp(),
        commitUid: "bob",
        commitName: "Bob Example",
      }));
    });
  });
  describe("ManagerNames", () => {
    it("allows users with time claim to read", async () => {
      const query = timeDb.collection("ManagerNames");
      await firebase.assertSucceeds(query.get());
    });
    it("prevents users without time claim from reading", async () => {
      const auth = { uid: "alice", email: "alice@example.com" };
      const db = firebase.initializeTestApp({ projectId, auth }).firestore();
      const query = db.collection("ManagerNames");
      await firebase.assertFails(query.get());
    });
  });
  //wtf.dump()
});
