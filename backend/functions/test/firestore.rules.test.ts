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
    it("requires a payrollId to be present", async () => {
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
    it("allows only admin and hr to change the defaultChargeOutRate", async() => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const db2 = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, hr: true } }).firestore();
      const db3 = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice } }).firestore();
      const db4 = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, cor: true } }).firestore();
      const doc = db.collection("Profiles").doc("bob"); // admin alice updating bob's profile
      const doc2 = db2.collection("Profiles").doc("bob"); // hr alice updating bob's profile
      const doc3 = db3.collection("Profiles").doc("bob"); // regular alice updating bob's profile
      const doc4 = db3.collection("Profiles").doc("alice"); // regular alice updating her own profile
      const doc5 = db4.collection("Profiles").doc("bob"); // cor alice updating bob's profile
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
          defaultChargeOutRate: 100,
        })
      );
      await firebase.assertSucceeds(
        doc5.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          doNotAcceptSubmissions: true,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
          defaultChargeOutRate: 100,
        })
      );
      // defaultChargeOutRate is not a number
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          doNotAcceptSubmissions: true,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
          defaultChargeOutRate: "100",
        })
      );
      // defaultChargeOutRate is not a multiple of 0.5
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          doNotAcceptSubmissions: true,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
          defaultChargeOutRate: 100.4,
        })
      );
      // defaultChargeOutRate is too big
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          doNotAcceptSubmissions: true,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
          defaultChargeOutRate: 1000,
        })
      );
      // defaultChargeOutRate is too small
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          doNotAcceptSubmissions: true,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
          defaultChargeOutRate: 0,
        })
      );
      await firebase.assertSucceeds(
        doc2.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          doNotAcceptSubmissions: true,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
          defaultChargeOutRate: 100,
        })
      );
      await firebase.assertFails(
        doc3.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          doNotAcceptSubmissions: true,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
          defaultChargeOutRate: 100,
        })
      );
      await firebase.assertFails(
        doc4.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          payrollId: 28,
          doNotAcceptSubmissions: true,
          defaultDivision: "ABC",
          salary: true,
          offRotation: false,
          defaultChargeOutRate: 100,
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
    it("requires a category to be set to one of the values in the categories list on the corresponding job if that job has a categories list", async () => {
      // setup categories on the job 19-333 used by entryJobProperties
      await jobs.doc("19-333").update({ categories: [ "category1", "category2" ] });
      await jobs.doc("19-444").set({ description: "A basic job", client: "A special client" });
      const { hours, ...missingHours } = baseline;
      const testEntry = { ...missingHours, jobHours: 5, ...entryJobProperties }
      const { job, ...missingJob } = testEntry;
      const doc = timeDb.collection("TimeEntries").doc();

      // succeeds when category is a string and that string is present in the job's categories list
      await firebase.assertSucceeds(
        doc.set({ ...testEntry, category: "category1" })
      );
      await firebase.assertSucceeds(
        doc.set({ ...testEntry, category: "category2" })
      );

      // fails when category is a string but the job doesn't have a categories list
      await firebase.assertFails(
        doc.set({ ...missingJob, job: "19-444", category: "category1" })
      );

      // fails when a category is not present but the job has a categories list
      await firebase.assertFails(
        doc.set({ ...testEntry })
      );

      // fails when category isn't a string
      await firebase.assertFails(
        doc.set({ ...testEntry, category: ["category2"] })
      );

      // fails when category is a string but that string isn't present in the job's categories list
      await firebase.assertFails(
        doc.set({ ...testEntry, category: "category3" })
      );
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
    const divisions = adminDb.collection("Divisions");
    const proposalSubmissionDueDate = new Date();
    const proposalOpeningDate = new Date(proposalSubmissionDueDate.getTime() - 10000000);
    const projectAwardDate = new Date(proposalOpeningDate.getTime() + 10000000);
    const job = { description: "A basic job", client: "A special client", clientContact: "Debbie Downer", jobOwner: "the client is working on behalf of this owner", managerUid: "alice", managerDisplayName: "Alice", status: "Active", hasTimeEntries: false, divisions: ["BM"], fnAgreement: false };
    const project = { ...job, projectAwardDate };
    const jobs = adminDb.collection("Jobs");

    beforeEach("reset data", async () => {
      await firebase.clearFirestoreData({ projectId });
      await jobs.doc("19-444").set(project);
      await jobs.doc("P19-444").set(project);
      await profiles.doc("alice").set(alice);
      await divisions.doc("B").set({ name: "Building Engineering (Group)" });
      await divisions.doc("BM").set({ name: "Mechanical" });
      await divisions.doc("BS").set({ name: "Structural" });
    });

    it("requires the clientContact field to be a string at least 6 chars long", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const doc = db.collection("Jobs").doc("19-333");
      
      // fails if clientContact is missing
      const { clientContact, ...missingClientContact } = project;
      await firebase.assertFails(doc.set(missingClientContact));

      // fails if clientContact is not a string
      await firebase.assertFails(doc.set({ ...project, clientContact: 123 }));

      // fails if clientContact is less than 6 chars
      await firebase.assertFails(doc.set({ ...project, clientContact: "12345" }));

      // succeeds if clientContact is a string at least 6 chars long
      await firebase.assertSucceeds(doc.set({ ...project, clientContact: "123456" }));
    });
    it("requires a jobOwner field as a string at least 6 chars long", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const doc = db.collection("Jobs").doc("19-333");

      // fails if jobOwner is missing
      const { jobOwner, ...missingJobOwner } = project;
      await firebase.assertFails(doc.set(missingJobOwner));
      
      // fails if jobOwner is not a string
      await firebase.assertFails(doc.set({ ...project, jobOwner: 123 }));

      // fails if jobOwner is less than 6 chars
      await firebase.assertFails(doc.set({ ...project, jobOwner: "12345" }));

      // succeeds if jobOwner is a string at least 6 chars long
      await firebase.assertSucceeds(doc.set(project));
    });
    it("requires at least one division to be set, divisions must be in 'Divisions' collection and not single letter (groups)", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const doc = db.collection("Jobs").doc("19-333");

      // fails if no divisions are set
      await firebase.assertFails(doc.set({ ...project, divisions: [] }));

      // fails if division is not a list
      await firebase.assertFails(doc.set({ ...project, divisions: 142 }));

      // fails if division is not in 'Divisions' collection
      await firebase.assertFails(doc.set({ ...project, divisions: ["ZZ"] }));

      // fails if division is a single letter (group) even if in 'Divisions' collection
      await firebase.assertFails(doc.set({ ...project, divisions: ["B"] }));

      // succeeds if the only division is in 'Divisions' collection
      await firebase.assertSucceeds(doc.set(project));

      // succeeds if multiple divisions are in 'Divisions' collection
      await firebase.assertSucceeds(doc.set({ ...project, divisions: ["BM", "BS"] }));
    });
    it("allows job claim holders to create jobs", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const db2 = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice } }).firestore();
      const doc = db.collection("Jobs").doc("19-333");
      const doc2 = db2.collection("Jobs").doc("19-333");
      await firebase.assertSucceeds(doc.set(project));
      await firebase.assertFails(doc2.set(project));
    });
    it("prevents updating the lastTimeEntryDate and hasTimeEntries fields", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const doc = db.collection("Jobs").doc("19-444");
      await firebase.assertSucceeds(doc.set(project));
      // the existing value of hasTimeEntries is false, so this should fail
      await firebase.assertFails(doc.update({ hasTimeEntries: true }));

      // the existing value of hasTimeEntries is false, so this succeed
      await firebase.assertSucceeds(doc.update({ hasTimeEntries: false }));
    
      // this should fail unless the new value is identical to the existing value
      const date = new Date();
      jobs.doc("19-444").update({ lastTimeEntryDate: date });
      await firebase.assertFails(doc.update({ lastTimeEntryDate: new Date() }));
      await firebase.assertSucceeds(doc.update({ lastTimeEntryDate: date }));
    });
    it("restricts value of status for projects", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const doc = db.collection("Jobs").doc("19-333");
      const {status, ...noStatus} = project;
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
      const proposal = { ...noStatus, proposalOpeningDate, proposalSubmissionDueDate };

      // fails if status is set to 'Closed'
      await firebase.assertFails(doc.set({ status: "Closed", ...proposal}));

      // proposals can have status of 'Active', 'Not Awarded', 'Awarded', or 'Cancelled'
      await firebase.assertSucceeds(doc.set({ status: "Active", ...proposal}));
      await firebase.assertSucceeds(doc.set({ status: "Not Awarded", ...proposal}));
      await firebase.assertSucceeds(doc.set({ status: "Awarded", ...proposal}));
      await firebase.assertSucceeds(doc.set({ status: "Cancelled", ...proposal}));
    });
    it("allows a job to be cancelled regardless of validity or closed regardless of validity if it is a project", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      await adminDb.collection("Jobs").doc("P19-444").set({"chocolatebar": false}); // missing proposalOpeningDate, proposalSubmissionDueDate, and projectAwardDate
      await adminDb.collection("Jobs").doc("19-333").set({"nutbar": false}); // missing projectAwardDate
      const doc1 = db.collection("Jobs").doc("19-333");
      const doc2 = db.collection("Jobs").doc("P19-444");
      
      // Test closing and cancelling invalid projects
      await firebase.assertSucceeds(doc1.update({ status: "Cancelled" }));
      await firebase.assertFails(doc1.update({ status: "Active" }));
      await firebase.assertSucceeds(doc1.update({ status: "Closed" }));
    
      // Test cancelling invalid proposals
      await firebase.assertFails(doc2.update({ status: "Not Awarded" }));
      await firebase.assertFails(doc2.update({ status: "Closed" }));
      await firebase.assertSucceeds(doc2.update({ status: "Cancelled" }));
      await firebase.assertFails(doc2.update({ status: "Active" }));
    });
    it("prevents job claim holders from creating jobs with invalid ID format", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const doc = db.collection("Jobs").doc("invalidIdFormat");
      const doc2 = db.collection("Jobs").doc("19-333");
      await firebase.assertFails(doc.set(project));
      await firebase.assertSucceeds(doc2.set(project));
    });
    it("prevents the description from being less than 4 characters long", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const doc = db.collection("Jobs").doc("19-333");
      await firebase.assertSucceeds(doc.set(project));
      const { description, ...noDescription } = project;
      await firebase.assertFails(doc.update({ ...noDescription, description: "not" }));
    });
    it("requires the proposal to reference a valid job if present on project. Must not be present on proposal", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const doc = db.collection("Jobs").doc("19-333");

      // succeeds when proposal present and references a valid job
      await firebase.assertSucceeds(doc.set({ ...project, proposal: "P19-444"}));

      // succeeds when proposal not present
      await firebase.assertSucceeds(doc.set({ ...project }));

      // fails when proposal present but references an invalid job
      await firebase.assertFails(doc.set({ ...project, proposal: "P19-555"}));

      // fails when proposal present and references a valid job but the job is not a proposal
      await firebase.assertFails(doc.set({ ...project, proposal: "19-444"}));

      // fails when proposal present and references a valid job but document being set is a proposal
      // because proposals cannot have proposals
      const proposalDoc = db.collection("Jobs").doc("P19-333");
      await firebase.assertFails(proposalDoc.set({ ...project, proposal: "P19-444"}));
    });
    it("requires a proposal to have a valid proposalOpeningDate and proposalSubmissionDueDate", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const doc = db.collection("Jobs").doc("P19-444");
      const projDoc = db.collection("Jobs").doc("19-444");
      const proposal = { ...job, proposalOpeningDate, proposalSubmissionDueDate };

      // succeeds when proposalOpeningDate and proposalSubmissionDueDate are present and valid
      await firebase.assertSucceeds(doc.set(proposal));

      // succeeds when proposalSubmissionDueDate and proposalOpeningDate are missing and the job is a project
      await firebase.assertSucceeds(projDoc.set(project));

      // fails when attempting to set proposalSubmissionDueDate on a project
      const projWithProposalSubmissionDueDate = { ...project, proposalSubmissionDueDate };
      await firebase.assertFails(projDoc.set(projWithProposalSubmissionDueDate));

      // fails when attempting to set proposalOpeningDate on a project
      const projWithProposalOpeningDate = { ...project, proposalOpeningDate };
      await firebase.assertFails(projDoc.set(projWithProposalOpeningDate));
      
      // fails when proposalSubmissionDueDate not present
      const { proposalSubmissionDueDate: _1, ...noProposalSubmissionDueDate } = proposal;
      await firebase.assertFails(doc.set(noProposalSubmissionDueDate));

      // fails when proposalOpeningDate not present
      const { proposalOpeningDate: _2, ...noProposalOpeningDate } = proposal;
      await firebase.assertFails(doc.set(noProposalOpeningDate));
      
      // fails when proposalSubmissionDueDate is not a date
      await firebase.assertFails(doc.set({ ...noProposalSubmissionDueDate, proposalSubmissionDueDate: "not a date" }));

      // fails when proposalOpeningDate is not a date
      await firebase.assertFails(doc.set({ ...noProposalOpeningDate, proposalOpeningDate: "not a date" }));
    });
    it("requires a project to have a valid projectAwardDate", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const doc = db.collection("Jobs").doc("19-444");
      const { projectAwardDate, ...noProjectAwardDate } = project;

      // succeeds when projectAwardDate is present and valid
      await firebase.assertSucceeds(doc.set(project));

      // fails when projectAwardDate is not present
      await firebase.assertFails(doc.set(noProjectAwardDate));

      // fails when projectAwardDate is not a date
      await firebase.assertFails(doc.set({ ...noProjectAwardDate, projectAwardDate: "not a date" }));

      // fails when attempting to set projectAwardDate on a proposal
      const proposalDoc = db.collection("Jobs").doc("P19-444");
      const proposal = { ...job, proposalOpeningDate, proposalSubmissionDueDate, projectAwardDate };
      await firebase.assertFails(proposalDoc.set(proposal));
    });
    it("requires the fnAgreement field to be present and a boolean", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const doc = db.collection("Jobs").doc("19-444");
      const { fnAgreement, ...noFnAgreement } = project;

      // succeeds when fnAgreement is present and a boolean
      await firebase.assertSucceeds(doc.set(project));

      // fails when fnAgreement is not present
      await firebase.assertFails(doc.set(noFnAgreement));

      // fails when fnAgreement is not a boolean
      await firebase.assertFails(doc.set({ ...noFnAgreement, fnAgreement: "not a boolean" }));
    });
    it("requires the categories property to be a list of strings of length 1 or more if present.", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const doc = db.collection("Jobs").doc("19-444");
      const with_categories = { ...project, categories: ["category1", "category2"] };
      const invalid_categories_a = { ...project, categories: ["", "category2"] };
      const invalid_categories_b = { ...project, categories: [6, "category2"] };
      const empty_categories = { ...project, categories: [] };
      await firebase.assertSucceeds(doc.set(project));
      await firebase.assertSucceeds(doc.set(with_categories)); // causing failure
      await firebase.assertFails(doc.set(empty_categories));
      await firebase.assertFails(doc.set(invalid_categories_a));
      await firebase.assertFails(doc.set(invalid_categories_b));
    });
    it("requires a proposal to have a valid proposalValue");
    it("requires a project to have a valid projectAgreementValue");
    it("requires the managerUid to reference a document in Profiles and be present", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const doc = db.collection("Jobs").doc("19-333");
      const { managerUid, ...noManagerUid } = project;
      // managerUid is present and in Profiles
      await firebase.assertSucceeds(doc.set({ ...noManagerUid, managerUid: "alice"}));

      // managerUid not present
      await firebase.assertFails(doc.set({ ...noManagerUid }));

      // managerUid not in Profiles
      await firebase.assertFails(doc.set({ ...noManagerUid, managerUid: "bob"}));
    });
    it("requires the alternateManagerUid to reference a document in Profiles if present", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const doc = db.collection("Jobs").doc("19-333");
      await profiles.doc("bob").set(bob);

      // alternateManagerUid not present
      await firebase.assertSucceeds(doc.set({ ...project }));

      // alternateManagerUid is present and in Profiles
      await firebase.assertSucceeds(doc.set({ ...project, alternateManagerUid: "bob"}));

      // alternateManagerUid not in Profiles
      await firebase.assertFails(doc.set({ ...project, alternateManagerUid: "charles"}));
    });
    it("requires the alternateManagerUid to be different from the managerUid if present", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const doc = db.collection("Jobs").doc("19-333");
      await profiles.doc("bob").set(bob);

      // alternateManagerUid is present and different from managerUid
      await firebase.assertSucceeds(doc.set({ ...project, alternateManagerUid: "bob"}));

      // alternateManagerUid is present and same as managerUid
      await firebase.assertFails(doc.set({ ...project, alternateManagerUid: "alice"}));
    });
    it("disallows the manager field on create or update", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, job: true } }).firestore();
      const doc = db.collection("Jobs").doc("19-333");

      // manager field not present
      await firebase.assertSucceeds(doc.set(project));

      // manager field present
      await firebase.assertFails(doc.set({ ...project, manager: "Ignored in app now" }));
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
