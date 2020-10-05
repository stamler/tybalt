// Testing Firestore rules
const firebase = require("@firebase/testing");

const MY_PROJECT_ID = "charade-ca63f";

const auth = { uid: "alice", email: "alice@example.com" };
const dbNotLoggedIn = firebase.initializeTestApp({projectId: MY_PROJECT_ID }).firestore();
const dbLoggedInNoClaims = firebase.initializeTestApp({projectId: MY_PROJECT_ID, auth }).firestore();
const dbLoggedInTimeClaim = firebase.initializeTestApp({projectId: MY_PROJECT_ID, auth: {...auth, time: true} }).firestore();
const dbLoggedInAdminClaim = firebase.initializeTestApp({projectId: MY_PROJECT_ID, auth: {...auth, admin: true} }).firestore();
const dbAdmin = firebase.initializeAdminApp({projectId: MY_PROJECT_ID }).firestore();

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
  return it(`${collection} denies authenticated users reading`, async () => {
    const doc = dbLoggedInNoClaims.collection(collection).doc();
    await firebase.assertFails(doc.get());
  });
}

function allowAdminWrite (collection) {
  return it(`${collection} allows admin-claim users to write`, async () => {
    const doc = dbLoggedInAdminClaim.collection(collection).doc();
    await firebase.assertSucceeds(doc.set({foo: "bar"}));
  });
}

function denyAdminWrite (collection) {
  return it(`${collection} denies admin-claim users writing`, async () => {
    const doc = dbLoggedInAdminClaim.collection(collection).doc();
    await firebase.assertFails(doc.set({foo: "bar"}));
  })
}

function allowAdminRead (collection) {
  return it(`${collection} allows admin-claim users to read`, async () => {
    const doc = dbLoggedInAdminClaim.collection(collection).doc();
    await firebase.assertSucceeds(doc.get());
  })
}


function denyAuthenticatedWrite (collection) {
  return it(`${collection} denies signed-in users writing`, async () => {
    const doc = dbLoggedInNoClaims.collection(collection).doc();
    await firebase.assertFails(doc.set({foo: "bar"}));
  });
}


describe("Firestore Rules", () => {

  before(() => {
    // setup database
    firebase.clearFirestoreData({ projectId: MY_PROJECT_ID });
    const timetypes = ["OB", "OH", "OO", "OP", "OR", "OS", "OV", "R"];
    const divisions = ["B", "BE", "BI", "BM", "BS", "CA", "CB", "CF", "CH", 
      "CI", "CS", "E", "EE", "EG", "EP", "G", "GE", "GL", "I", "IC", "IH", 
      "IM", "M", "MD", "MF", "ML", "XB", "XE", "XF"];
    const batch = dbAdmin.batch();
    timetypes.forEach(timetype => {
      const newDoc = dbAdmin.collection("TimeTypes").doc(timetype);
      batch.set(newDoc, { name: `${timetype} name`});
    })
    divisions.forEach(division => {
      const newDoc = dbAdmin.collection("Divisions").doc(division);
      batch.set(newDoc, { name: `${division} name`});
    })
    batch.commit();
  });

  after(() => {
  })

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
    ["Config", "RawLogins"].forEach(collection => {
      denyAuthenticatedRead(collection);
    });
  })

  describe("Authenticated Writes", () => {
    ["Computers", "Config", "Divisions", "Projects", "RawLogins", "TimeTypes"].forEach(collection => {
      denyAuthenticatedWrite(collection);
    })
  })

  describe("Admin Writes", () => {
    ["Divisions", "Projects", "TimeTypes"].forEach(collection => {
      allowAdminWrite(collection);
    });
    ["Computers", "Config", "RawLogins"].forEach(collection => {
      denyAdminWrite(collection);
    })
  })

  describe("Admin Reads", () => {
    ["Logins", "Profiles", "RawLogins", "Users"].forEach(collection => {
      allowAdminRead(collection);
    })
  })


  describe("RawLogins", () => {
    it("Allows admins to delete stuff", async () => {
      const doc = dbLoggedInAdminClaim.collection("RawLogins").doc();
      await firebase.assertSucceeds(doc.delete());      
    })
    it ("Prevents anybody else from deleting stuff", async () => {
      const doc = dbLoggedInNoClaims.collection("RawLogins").doc();
      await firebase.assertFails(doc.delete());      
    })
  })

  describe("TimeEntries", () => {
    it("requires Off-Rotation documents to have only a uid, date, and TimeType", async () => {      
      const doc = dbLoggedInTimeClaim.collection("TimeEntries").doc();
      await firebase.assertSucceeds(doc.set({uid: "alice", date:new Date(),
        timetype:"OR"}));
      await firebase.assertFails(doc.set({uid:"alice", timetype:"OR"}))
      await firebase.assertFails(doc.set({uid:"alice", date:new Date()}))
      await firebase.assertFails(doc.set({uid:"alice", date:new Date(),
        timetype:"OR", hours: 5}))
    })
    it("requires Hours-worked documents to have a valid Division", async () => {
      const doc = dbLoggedInTimeClaim.collection("TimeEntries").doc();
      await firebase.assertSucceeds(doc.set({uid: "alice", date:new Date(), 
        timetype:"R", division: "CI", hours:5 }));
      await firebase.assertFails(doc.set({uid: "alice", date:new Date(), 
        timetype:"R", hours:5 }));
    })
  })
  describe("TimeSheets", () => {
  })
})