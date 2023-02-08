import * as firebase from "@firebase/rules-unit-testing";
import "mocha";
import { addDays } from "date-fns";

const projectId = "test-app-id";

const alice = { displayName: "Alice Example", timeSheetExpected: false, email: "alice@example.com", personalVehicleInsuranceExpiry: addDays(new Date(), 7), salary: false, payrollId: 28 };
const bob = { displayName: "Bob Example", email: "bob@example.com", timeSheetExpected: true };
const chuck = { displayName: "Chuck Example", email: "chuck@example.com", timeSheetExpected: true };
const adminDb = firebase.initializeAdminApp({ projectId }).firestore();
const timeDb = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, time: true } }).firestore();
const profiles = adminDb.collection("Profiles");
const managerNames = adminDb.collection("ManagerNames");

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

describe("Other Firestore Rules", function () {
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

  describe("TimeTracking", () => {
    beforeEach("reset data", async () => {
      await firebase.clearFirestoreData({ projectId });
      await profiles.doc("alice").set(alice);
      await profiles.doc("bob").set(bob);
    });

    it("allows report claim holders (report) to mark uids as not missing for this date range", async () => {
      await adminDb.collection("TimeTracking").doc("asdf1").set({ created: new Date("2021-01-08T13:00:00.000-05:00"), weekEnding: new Date("2021-01-09T23:59:59.999-05:00"), pending: {}, submitted: {}, timeSheets: {} });
      await profiles.doc("chuck").set(chuck);
      await profiles.doc("fred").set(chuck);
      await profiles.doc("lucy").set(chuck);
      await profiles.doc("linus").set(chuck);
      await profiles.doc("marcie").set(chuck);
      await profiles.doc("kyle").set(chuck);
      await profiles.doc("persephone").set(chuck);
      await profiles.doc("olaf").set(chuck);
      await profiles.doc("sven").set(chuck);
      await profiles.doc("lars").set(chuck);
      await profiles.doc("marlies").set(chuck);
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...bob, report: true } }).firestore();
      const doc = db.collection("TimeTracking").doc("asdf1");
      await firebase.assertFails(doc.update({ notMissingUids: firebase.firestore.FieldValue.arrayUnion("fidel")}));
      await firebase.assertSucceeds(doc.update({ notMissingUids: firebase.firestore.FieldValue.arrayUnion("chuck")}));
      await firebase.assertSucceeds(doc.update({ notMissingUids: firebase.firestore.FieldValue.arrayRemove("chuck")}));
      await firebase.assertSucceeds(doc.update({ notMissingUids: firebase.firestore.FieldValue.arrayUnion("chuck", "fred", "lucy", "linus", "marcie", "kyle", "persephone", "olaf", "sven", "lars")}));
      await firebase.assertSucceeds(doc.update({ notMissingUids: firebase.firestore.FieldValue.arrayUnion("chuck", "fred", "lucy", "linus", "marcie", "kyle", "persephone", "olaf", "sven", "lars")}));
      // can't accept more than 10
      await firebase.assertFails(doc.update({ notMissingUids: firebase.firestore.FieldValue.arrayUnion("chuck", "fred", "lucy", "linus", "marcie", "kyle", "persephone", "olaf", "sven", "lars", "marlies")}));
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
    const divisions = adminDb.collection("Divisions");

    beforeEach("reset data", async () => {
      await firebase.clearFirestoreData({ projectId });
      await profiles.doc("alice").set(alice);
      await profiles.doc("bob").set(bob);
      await managerNames.doc("alice").set(alice);
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
    it("allows a user to read someone else's profile if they are that other person's manager", async () => {
      const aliceDb = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, time: true, tapr: true } }).firestore();
      await profiles.doc("bob").update({managerUid: "alice"});
      const doc = aliceDb.collection("Profiles").doc("bob");
      await firebase.assertSucceeds(doc.get());
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
          payrollId: 28,
          defaultDivision: "ABC",
          salary: false,
        })
      );
    });
    it("rejects if tbtePayrollId is present but does not match payrollId", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const doc = db.collection("Profiles").doc("bob");
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: 29,
          payrollId: 29,
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          tbtePayrollId: 29,
          payrollId: 30,
          defaultDivision: "ABC",
          salary: false,
        })
      );
    });
    it("requires offRotation to be boolean or missing", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const doc = db.collection("Profiles").doc("bob");
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          defaultDivision: "ABC",
          salary: true,
          offRotation: true,
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          defaultDivision: "ABC",
          salary: true,
          offRotation: firebase.firestore.FieldValue.delete(),
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          defaultDivision: "ABC",
          salary: true,
          offRotation: "not a boolean",
        })
      );
    });
    it("requires alternateManager to be string referencing ID in ManagerNames collection or missing", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const doc = db.collection("Profiles").doc("bob");
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          defaultDivision: "ABC",
          salary: true,
          alternateManager: "alice"
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          defaultDivision: "ABC",
          salary: true,
          alternateManager: "franklin"
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          defaultDivision: "ABC",
          salary: true,
          alternateManager: firebase.firestore.FieldValue.delete(),
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          defaultDivision: "ABC",
          salary: true,
          alternateManager: true,
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          defaultDivision: "ABC",
          salary: true,
          alternateManager: 66,
        })
      );
    });
    it("allows only admin and owner to change alternateManager", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const db2 = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice } }).firestore();
      const doc = db.collection("Profiles").doc("bob"); // admin alice updating bob's profile
      const doc2 = db2.collection("Profiles").doc("bob"); // regular alice updating bob's profile
      const doc3 = db2.collection("Profiles").doc("alice"); // regular alice updating her own profile
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          defaultDivision: "ABC",
          salary: true,
          alternateManager: "alice"
        })
      );
      await firebase.assertFails(
        doc2.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          defaultDivision: "ABC",
          salary: true,
          alternateManager: "alice"
        })
      );
      await firebase.assertSucceeds(
        doc3.update({
          managerUid: "alice",
          defaultDivision: "ABC",
          alternateManager: "alice"
        })
      );
    });
    it("allows only admin and owner to change doNotAcceptSubmissions", async() => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const db2 = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice } }).firestore();
      const doc = db.collection("Profiles").doc("bob"); // admin alice updating bob's profile
      const doc2 = db2.collection("Profiles").doc("bob"); // regular alice updating bob's profile
      const doc3 = db2.collection("Profiles").doc("alice"); // regular alice updating her own profile
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          doNotAcceptSubmissions: true,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
      await firebase.assertFails(
        doc2.update({
          managerUid: "alice",
          doNotAcceptSubmissions: true,
          defaultDivision: "ABC",
        })
      );
      await firebase.assertSucceeds(
        doc3.update({
          managerUid: "alice",
          doNotAcceptSubmissions: true,
          defaultDivision: "ABC",
        })
      );
    });
    it("allows only admin to change untrackedTimeOff", async() => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const db2 = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice } }).firestore();
      const doc = db.collection("Profiles").doc("bob"); // admin alice updating bob's profile
      const doc2 = db2.collection("Profiles").doc("bob"); // regular alice updating bob's profile
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          untrackedTimeOff: true,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
      await firebase.assertFails(
        doc2.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          untrackedTimeOff: true,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
    });
    it("prevents untrackedTimeOff:true if salary:false", async() => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const doc = db.collection("Profiles").doc("bob");
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          untrackedTimeOff: true,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          untrackedTimeOff: false,
          defaultDivision: "ABC",
          salary: false,
          offRotation: false,
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          untrackedTimeOff: true,
          defaultDivision: "ABC",
          salary: false,
          offRotation: false,
        })
      );
    });
    it("prevents skipMinTimeCheckOnNextBundle:true if salary:false", async() => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const doc = db.collection("Profiles").doc("bob");
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          skipMinTimeCheckOnNextBundle: true,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          skipMinTimeCheckOnNextBundle: true,
          defaultDivision: "ABC",
          salary: false,
          offRotation: false,
        })
      );
    });
    it("prevents skipMinTimeCheckOnNextBundle:true if untrackedTimeOff:true", async() => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const doc = db.collection("Profiles").doc("bob");
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          skipMinTimeCheckOnNextBundle: true,
          untrackedTimeOff: false,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          skipMinTimeCheckOnNextBundle: true,
          untrackedTimeOff: true,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
    });
    it("requires workWeekHours to be positive integer 0 < x <=40 or missing", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const doc = db.collection("Profiles").doc("bob");
      // missing
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
      // positive integer (5)
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          workWeekHours: 5,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
      // zero fails
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          workWeekHours: 0,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
      // negative integer (-5)
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          workWeekHours: -5,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
      // positive integer (41)
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          workWeekHours: 41,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
      // text
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          workWeekHours: "5",
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );

    });
    it("requires doNotAcceptSubmissions to be boolean or missing", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const doc = db.collection("Profiles").doc("bob");
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          doNotAcceptSubmissions: true,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          doNotAcceptSubmissions: "true",
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
    });
    it("requires skipMinTimeCheckOnNextBundle to be boolean or missing", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const doc = db.collection("Profiles").doc("bob");
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          skipMinTimeCheckOnNextBundle: true,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          skipMinTimeCheckOnNextBundle: false,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          skipMinTimeCheckOnNextBundle: "true",
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
    });
    it("requires allowPersonalReimbursement to be boolean or missing", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const doc = db.collection("Profiles").doc("bob");
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          allowPersonalReimbursement: true,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          allowPersonalReimbursement: false,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          allowPersonalReimbursement: "true",
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
    });
    it("requires untrackedTimeOff to be boolean or missing", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const doc = db.collection("Profiles").doc("bob");
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          untrackedTimeOff: true,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          untrackedTimeOff: false,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          untrackedTimeOff: "true",
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
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
          payrollId: 28,
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
          payrollId: 28,
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
          payrollId: 28,
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
          payrollId: 28,
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
          payrollId: 28,
          defaultDivision: "ABC",
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          defaultDivision: "ABC",
          salary: "string",
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          defaultDivision: "ABC",
          salary: false,
        })
      );
    });
    it("requires a payrollId to be a positive integer or CMS{1,2}", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const doc = db.collection("Profiles").doc("bob");
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28.2,
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: -4,
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: "CMS",
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: "CMS2",
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: "CMS22",
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: "CMS222",
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: "BMS22",
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
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
          payrollId: 28,
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
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
          payrollId: 28,
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertFails(
        doc.set({ 
          timeSheetExpected: true,
          displayName: "Bob", 
          managerUid: "alice",
          payrollId: 28,
          defaultDivision: "ABC",
          salary: false,
        })
      );
      await firebase.assertFails(
        doc.set({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
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
          payrollId: 28,
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
          payrollId: 28,
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
          payrollId: 28,
          defaultDivision: "DEF",
          salary: false,
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          defaultDivision: "ABC",
          salary: false,
        })
      );

    });
  });

  describe("TimeEntries", () => {
    const divisions = adminDb.collection("Divisions");
    const timetypes = adminDb.collection("TimeTypes");
    const timeentries = adminDb.collection("TimeEntries");
    const jobs = adminDb.collection("Jobs");
    const baseline = { uid: "alice", date: new Date(), timetype: "R", timetypeName: "Hours Worked", division: "ABC", hours: 5, workDescription: "5char" };
    const entryJobProperties = { job: "19-333", jobDescription: "A basic job", client: "A special client" };

    beforeEach("reset data", async () => {
      await firebase.clearFirestoreData({ projectId });
      await divisions.doc("ABC").set({ name: "Playtime" });
      await timetypes.doc("R").set({ name: "Hours Worked" });
      await timetypes.doc("RT").set({ name: "Training" });
      await timetypes.doc("OH").set({ name: "Statutory Holiday" });
      await timetypes.doc("OP").set({ name: "PPTO" });
      await timetypes.doc("OW").set({ name: "Full Week Off)" });
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
    it("requires description to be missing if timetype is OR, OW, RB, or OTO", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      await firebase.assertFails(doc.set({ uid: "alice", date: new Date(), timetype: "OR", timetypeName: "Off Rotation", workDescription: "5char" }));
      await firebase.assertFails(doc.set({ uid: "alice", date: new Date(), timetype: "OW", timetypeName: "Off", workDescription: "5char" }));
      await firebase.assertSucceeds(doc.set({ uid: "alice", date: new Date(), timetype: "OW", timetypeName: "Off" }));
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
      const { hours, ...missingHours } = baseline;
      await firebase.assertSucceeds( doc.set({ ...missingHours, jobHours: 5, ...entryJobProperties, workrecord: "K20-420" }) );
      const { job, ...missingJob } = entryJobProperties;
      await firebase.assertFails( doc.set({ ...missingHours, jobHours: 5, ...missingJob, job: "notjob", workrecord: "K20-420" }) );
      await firebase.assertFails( doc.set({ ...missingHours, jobHours: 5, ...missingJob, workrecord: "K20-420" }) );
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
      await firebase.assertSucceeds(doc.set({ ...missingHours, ...entryJobProperties, mealsHours: 0.5, jobHours: 5}));
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
      await firebase.assertSucceeds(doc.set({ ...missingHours, ...entryJobProperties, jobHours:4, mealsHours: 1}));
      await firebase.assertSucceeds(doc.set({ ...missingHours, ...entryJobProperties, jobHours:4, mealsHours: 0.5}));
      await firebase.assertFails(doc.set({ ...missingHours, ...entryJobProperties, jobHours:4, mealsHours: 0.6}));
      await firebase.assertFails(doc.set({ ...missingHours, ...entryJobProperties, jobHours:4, mealsHours: 19}));
      await firebase.assertFails(doc.set({ ...missingHours, ...entryJobProperties, jobHours:4, mealsHours: -1}));
      await firebase.assertFails(doc.set({ ...missingHours, ...entryJobProperties, jobHours:4, mealsHours: "duck"}));
    });
    it("requires sum of hours, jobHours, and mealsHours to be less than or equal to 18", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      const { hours, ...missingHours } = baseline;
      await firebase.assertSucceeds(doc.set({ ...missingHours, ...entryJobProperties, jobHours: 12, mealsHours: 0.5 }));
      await firebase.assertFails(doc.set({ ...missingHours, ...entryJobProperties, jobHours: 18, mealsHours: 0.5 }));
      await firebase.assertSucceeds(doc.set({ ...missingHours, hours: 16, mealsHours: 1.5 }));
      await firebase.assertFails(doc.set({ ...missingHours, hours: 17, mealsHours: 1.5 }));

    });
    it("allows hours to be positive multiples of 0.5 over 18 if timetype is RB", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      const entrySucceeds = { date: new Date(), timetype: "RB", timetypeName: "Add Overtime to Bank", uid: "alice", hours: 22 };
      const entryFails = { date: new Date(), timetype: "RB", timetypeName: "Add Overtime to Bank", uid: "alice", hours: 22.25 };
      await firebase.assertSucceeds(doc.set(entrySucceeds));
      await firebase.assertFails(doc.set(entryFails));
    });

    it("requires a referenced job to be valid", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      const { job, ...missingJob } = entryJobProperties;
      const { hours, ...missingHours } = baseline;
      await firebase.assertSucceeds(doc.set({ ...missingHours, jobHours: 5, ...missingJob, job:"19-333" }));
      await firebase.assertFails(doc.set({ ...missingHours, jobHours: 5, ...missingJob, job:"20-333" }));
    });
    it("requires jobDescription and client to match a referenced job's respective properties", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      const { jobDescription, ...missingJobDescription } = entryJobProperties;
      const { client, ...missingClient } = entryJobProperties;
      const { hours, ...missingHours } = baseline;
      await firebase.assertFails(doc.set({ ...missingHours, jobHours: 5, ...missingJobDescription, jobDescription:"Non-matching description" }));
      await firebase.assertFails(doc.set({ ...missingHours, jobHours: 5, ...missingClient, client:"Non-matching client" }));
      await firebase.assertSucceeds(doc.set({ ...missingHours, jobHours: 5, ...entryJobProperties }));
    });
    it("requires workrecords to match the correct format", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      const { hours, ...missingHours } = baseline;
      await firebase.assertSucceeds( doc.set({ ...missingHours, jobHours: 5, ...entryJobProperties, workrecord: "Q20-423" }) );
      await firebase.assertSucceeds( doc.set({ ...missingHours, jobHours: 5, ...entryJobProperties, workrecord: "K20-423-1" }) );
      await firebase.assertFails( doc.set({ ...missingHours, jobHours: 5, ...entryJobProperties, workrecord: "F18-33-1" }) );
      await firebase.assertFails( doc.set({ ...missingHours, jobHours: 5, ...entryJobProperties, workrecord: "asdf" }) );
    });
    it("requires jobHours not be present if there is no job", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      const { hours, ...missingHours } = baseline;
      await firebase.assertSucceeds(doc.set({ ...missingHours, jobHours: 5, ...entryJobProperties }));
      await firebase.assertFails(doc.set({ ...missingHours, jobHours: 5 }));
    });
    it("requires hours not be present if there is a job", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      const { hours, ...missingHours } = baseline;
      await firebase.assertSucceeds(doc.set({ ...missingHours, jobHours: 5, ...entryJobProperties }));
      await firebase.assertFails(doc.set({ ...missingHours, hours: 5,  jobHours: 5, ...entryJobProperties }));
      await firebase.assertFails(doc.set({ ...missingHours, hours: 5, ...entryJobProperties }));
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
    it("requires off-rotation entries (OR) and week off entries (OW) to have only uid, date, timetype, timetypeName", async () => {
      const doc = timeDb.collection("TimeEntries").doc();
      await firebase.assertSucceeds(doc.set({ uid: "alice", date: new Date(), timetype: "OR", timetypeName: "Off Rotation" }));
      await firebase.assertSucceeds(doc.set({ uid: "alice", date: new Date(), timetype: "OW", timetypeName: "Off" }));
      await firebase.assertFails(doc.set({ uid: "alice", date: new Date(), timetype: "OR", timetypeName: "Off Rotation", workDescription: "Valid Description" }));
      await firebase.assertFails(doc.set({ uid: "alice", date: new Date(), timetype: "OW", timetypeName: "Off", workDescription: "Valid Description" }));
      await firebase.assertFails(doc.set({ uid: "alice", date: new Date(), timetype: "OR", timetypeName: "Off Rotation", hours: 5 }));
      await firebase.assertFails(doc.set({ uid: "alice", date: new Date(), timetype: "OW", timetypeName: "Off", hours: 5 }));
      await firebase.assertFails(doc.set({ uid: "alice", date: new Date(), timetype: "OR", timetypeName: "Off Rotation", jobHours: 5 }));
      await firebase.assertFails(doc.set({ uid: "alice", date: new Date(), timetype: "OW", timetypeName: "Off", jobHours: 5 }));
      await firebase.assertFails(doc.set({ uid: "alice", date: new Date(), timetype: "OR", timetypeName: "Off Rotation", mealsHours: 5 }));
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
