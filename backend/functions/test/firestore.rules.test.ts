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

  describe("Jobs", () => {
    it("requires the job claim to create or update");
    it("requires the proposal to reference a valid job if present");
    it("requires the proposal to be in the valid format if present");
    it("requires the job id to be in the correct format");
    it("requires the job name field to be at least 5 characters long");
  });
  //wtf.dump()
});
