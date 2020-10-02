// Testing Firestore rules
const firebase = require("@firebase/testing");

const MY_PROJECT_ID = "charade-ca63f";

const auth = { uid: "alice", email: "alice@example.com" };
const dbNotLoggedIn = firebase.initializeTestApp({projectId: MY_PROJECT_ID }).firestore();
const dbLoggedInNoClaims = firebase.initializeTestApp({projectId: MY_PROJECT_ID, auth }).firestore();
const dbLoggedInTimeClaim = firebase.initializeTestApp({projectId: MY_PROJECT_ID, auth: {...auth, time: true} }).firestore();
const dbLoggedInAdminClaim = firebase.initializeTestApp({projectId: MY_PROJECT_ID, auth: {...auth, admin: true} }).firestore();

function denyUnauthenticatedReadWrite (collection) {
  return it(`${collection} denies unauthenticated reads and writes`, async () => {
    const doc = dbNotLoggedIn.collection(collection).doc();
    await firebase.assertFails(doc.get());
    await firebase.assertFails(doc.set({foo: "bar"}));
  });
}

function allowAuthenticatedRead (collection) {
  return it(`${collection} allows all authenticated users to read`, async () => {
    const doc = dbLoggedInNoClaims.collection(collection).doc();
    await firebase.assertSucceeds(doc.get());
  });
}

function denyAuthenticatedRead (collection) {
  return it(`${collection} denies all authenticated users to read`, async () => {
    const doc = dbLoggedInNoClaims.collection(collection).doc();
    await firebase.assertFails(doc.get());
  });
}

function allowAdminWrite (collection) {
  return it("Allows admin-claim users writing", async () => {
    const doc = dbLoggedInAdminClaim.collection(collection).doc();
    await firebase.assertSucceeds(doc.set({foo: "bar"}));
  });
}

function denyAuthenticatedWrite (collection) {
  return it("Denies signed-in users writing", async () => {
    const doc = dbLoggedInNoClaims.collection(collection).doc();
    await firebase.assertFails(doc.set({foo: "bar"}));
  });
}

function denyAdminWrite (collection) {
  return it("Denies admin-claim users writing", async () => {
    const doc = dbLoggedInAdminClaim.collection(collection).doc();
    await firebase.assertFails(doc.set({foo: "bar"}));
  })
}

describe("Firestore Rules", () => {
  describe("Unauthenticated Reads and Writes", () => {
    ["Computers", "Config", "Divisions", "Logins", "Profiles", 
    "Projects", "RawLogins", "TimeEntries", "TimeSheets", 
    "TimeTypes", "Users"].forEach(collection => {
      denyUnauthenticatedReadWrite(collection);
    })
  })

  describe("Authenticated Reads", () => {
    ["Computers", "Divisions", "Projects", "TimeTypes"].forEach(collection => {
      allowAuthenticatedRead(collection);
    });
    ["Config"].forEach(collection => {
      denyAuthenticatedRead(collection);
    });
  })
  describe("Computers", () => {
    denyAdminWrite("Computers");
    denyAuthenticatedWrite("Computers");
  })
  describe("Config", () => {
    denyAdminWrite("Config");
    denyAuthenticatedWrite("Config");
  })
  describe("Divisions", () => {
    allowAdminWrite("Divisions");
    denyAuthenticatedWrite("Divisions");
  })
  describe("Logins", () => {
  })
  describe("Profiles", () => {
  })
  describe("Projects", () => {
    allowAdminWrite("Projects");
    denyAuthenticatedWrite("Projects");
  })

  describe("RawLogins", () => {
    denyAuthenticatedWrite("RawLogins");
    denyAdminWrite("RawLogins");
    it("Allows admins to read and delete stuff", async () => {

    })
    it ("Prevents anybody else from reading or deleting stuff", async () => {

    })
    it("Prevents anybody from creating or updating stuff", async () => {

      // Test with auth admin
      let db = firebase.initializeTestApp({projectId: MY_PROJECT_ID, authAdmin }).firestore();
      let document = db.collection("RawLogins").doc();
      await firebase.assertFails(document.set({foo: "bar"}));

      // Test with non-auth admin
      db = firebase.initializeTestApp({projectId: MY_PROJECT_ID }).firestore();
      document = db.collection("RawLogins").doc();
      await firebase.assertFails(document.set({foo: "bar"}));
    });
  })

  describe("TimeEntries", () => {
  })
  describe("TimeSheets", () => {
  })
  describe("TimeTypes", () => {
    it("Allows admin-claim users writing", async () => {
      const doc = dbLoggedInAdminClaim.collection("Divisions").doc();
      await firebase.assertSucceeds(doc.set({foo: "bar"}));
    })
    it("Denies signed-in users writing", async () => {
      const doc = dbLoggedInNoClaims.collection("Divisions").doc();
      await firebase.assertFails(doc.set({foo: "bar"}));
    })

  })
  describe("Users", () => {})
})