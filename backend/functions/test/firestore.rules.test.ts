import * as firebase from "@firebase/rules-unit-testing";
import "mocha";
//import * as wtf from "wtfnode";

const projectId = "charade-ca63f";

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
    ["Logins", "Profiles", "RawLogins", "Users"].forEach((collection) => {
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
    const alice = { displayName: "Alice Example", email: "alice@example.com" };
    const bob = { displayName: "Bob Example", email: "bob@example.com" };
    const division = { name: "Playtime" };
    const adminDb = firebase.initializeAdminApp({ projectId }).firestore();
    const profiles = adminDb.collection("Profiles");
    const divisions = adminDb.collection("Divisions");

    beforeEach("reset data", async () => {
      await firebase.clearFirestoreData({ projectId });
      await profiles.doc("alice").set(alice);
      await profiles.doc("bob").set(bob);
      await divisions.doc("ABC").set(division);
    });

    it("requires a referenced manager to be valid", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, admin: true } }).firestore();
      const doc = db.collection("Profiles").doc("bob");  
      await firebase.assertFails(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "ronswanson",
          defaultDivision: "ABC",
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          defaultDivision: "ABC",
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
          defaultDivision: "ABC",
        })
      );
      await firebase.assertFails(
        doc.set({ 
          displayName: "Bob", 
          managerUid: "alice",
          defaultDivision: "ABC",
        })
      );
      await firebase.assertSucceeds(
        doc.set({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          defaultDivision: "ABC",
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
          defaultDivision: "DEF",
        })
      );
      await firebase.assertSucceeds(
        doc.update({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
          defaultDivision: "ABC",
        })
      );

    });
  });

  describe("TimeSheets", () => {
    const alice = { displayName: "Alice Example", email: "alice@example.com" };
    const bob = { displayName: "Bob Example", email: "bob@example.com" };
    const timesheet = { uid: "bob", managerUid: "alice", submitted: false, rejected: false, approved: false };
    const adminDb = firebase.initializeAdminApp({ projectId }).firestore();
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
        doc.set({ rejected: true, rejectionReason: "6chars" }, { merge: true })
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
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, time: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
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

  describe("Jobs", () => {
    it("requires the job claim to create or update");
    it("requires the proposal to reference a valid job if present");
    it("requires the proposal to be in the valid format if present");
    it("requires the job id to be in the correct format");
    it("requires the job name field to be at least 5 characters long");
  });
  //wtf.dump()
});
