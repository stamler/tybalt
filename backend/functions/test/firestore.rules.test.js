// Testing Firestore rules
const firebase = require("@firebase/testing");

const MY_PROJECT_ID = "charade-ca63f";

const auth = { uid: "alice", email: "alice@example.com" };
const authBob = { uid: "bob", email: "bob@example.com" };
const dbLoggedInNoClaims = firebase
  .initializeTestApp({ projectId: MY_PROJECT_ID, auth })
  .firestore();
const dbLoggedInTimeClaim = firebase
  .initializeTestApp({
    projectId: MY_PROJECT_ID,
    auth: { ...auth, time: true },
  })
  .firestore();
const dbLoggedInTaprClaim = firebase
  .initializeTestApp({
    projectId: MY_PROJECT_ID,
    auth: { ...auth, tapr: true },
  })
  .firestore();
const dbLoggedInTimeClaimBob = firebase
  .initializeTestApp({
    projectId: MY_PROJECT_ID,
    auth: { ...authBob, time: true },
  })
  .firestore();
const dbLoggedInAdminClaim = firebase
  .initializeTestApp({
    projectId: MY_PROJECT_ID,
    auth: { ...auth, admin: true },
  })
  .firestore();
const dbAdmin = firebase
  .initializeAdminApp({ projectId: MY_PROJECT_ID })
  .firestore();

function allowAdminWrite(collection) {
  return it(`${collection} allows admin-claim users to write`, async () => {
    const doc = dbLoggedInAdminClaim.collection(collection).doc();
    await firebase.assertSucceeds(doc.set({ foo: "bar" }));
  });
}

function denyAdminWrite(collection) {
  return it(`${collection} denies admin-claim users writing`, async () => {
    const doc = dbLoggedInAdminClaim.collection(collection).doc();
    await firebase.assertFails(doc.set({ foo: "bar" }));
  });
}

function allowAdminRead(collection) {
  return it(`${collection} allows admin-claim users to read`, async () => {
    const doc = dbLoggedInAdminClaim.collection(collection).doc();
    await firebase.assertSucceeds(doc.get());
  });
}

describe("Firestore Rules", () => {

  describe("Admin Writes", () => {
    ["Divisions", "TimeTypes"].forEach((collection) => {
      allowAdminWrite(collection);
    });
    ["Computers", "Config", "RawLogins"].forEach((collection) => {
      denyAdminWrite(collection);
    });
  });

  describe("Admin Reads", () => {
    ["Logins", "Profiles", "RawLogins", "Users"].forEach((collection) => {
      allowAdminRead(collection);
    });
  });

  describe("RawLogins", () => {
    it("Allows admins to delete stuff", async () => {
      const doc = dbLoggedInAdminClaim.collection("RawLogins").doc();
      await firebase.assertSucceeds(doc.delete());
    });
    it("Prevents anybody else from deleting stuff", async () => {
      const doc = dbLoggedInNoClaims.collection("RawLogins").doc();
      await firebase.assertFails(doc.delete());
    });
  });

  describe("TimeEntries", () => {
    it("requires jobHours not be present if there is no job");
    it(
      "requires Banking (RB) entries to have only a uid, date, and timetype, and hours"
    );
    it("allows owners to read their own Time Entries if they have time claim");
    it("prevents reading without a time claim");
    it("prevents reading with a time claim if the owner doesn't match");
    it("requires submitted uid to match the authenticated user id", async () => {
      const doc = dbLoggedInTimeClaim.collection("TimeEntries").doc();
      await firebase.assertSucceeds(
        doc.set({ uid: "alice", date: new Date(), timetype: "OR" })
      );
      await firebase.assertFails(
        doc.set({ uid: "bob", date: new Date(), timetype: "OR" })
      );
    });
    it("requires Off-Rotation (OR) entries to have only a uid, date, and timetype", async () => {
      const doc = dbLoggedInTimeClaim.collection("TimeEntries").doc();
      await firebase.assertSucceeds(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "OR",
          timetypeName: "Off Rotation (Full Day)",
        })
      );
      await firebase.assertFails(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "OR",
          timetypeName: "Off Rotation (Full Day)",
          hours: 5,
        })
      );
      await firebase.assertFails(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "OR",
          timetypeName: "Off Rotation (Full Day)",
          jobHours: 5,
        })
      );
      await firebase.assertFails(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "OR",
          timetypeName: "Off Rotation (Full Day)",
          mealsHours: 5,
        })
      );
      await firebase.assertFails(doc.set({ uid: "alice", timetype: "OR" }));
      await firebase.assertFails(doc.set({ uid: "alice", date: new Date() }));
    });
    it("requires Hours-worked documents to have a valid division", async () => {
      const doc = dbLoggedInTimeClaim.collection("TimeEntries").doc();
      await firebase.assertSucceeds(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          hours: 5,
        })
      );
      await firebase.assertFails(
        doc.set({ uid: "alice", date: new Date(), timetype: "R", hours: 5 })
      );
      await firebase.assertFails(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "NOTINDB",
          hours: 5,
        })
      );
    });
    it("requires documents not have unspecified fields", async () => {
      const doc = dbLoggedInTimeClaim.collection("TimeEntries").doc();
      await firebase.assertSucceeds(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          hours: 5,
        })
      );
      await firebase.assertFails(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          hours: 5,
          foo: "bar",
        })
      );
    });
    it("requires a document's timetype value to reference a valid timetype", async () => {
      const doc = dbLoggedInTimeClaim.collection("TimeEntries").doc();
      await firebase.assertSucceeds(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          hours: 5,
        })
      );
      await firebase.assertFails(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "NONVALIDTIMETYPE",
          division: "CI",
          hours: 5,
        })
      );
    });
    it("requires documents with workrecord key to reference a valid job", async () => {
      const doc = dbLoggedInTimeClaim.collection("TimeEntries").doc();
      await firebase.assertSucceeds(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          hours: 5,
          job: "19-333",
          workrecord: "K20-420",
        })
      );
      await firebase.assertFails(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          hours: 5,
          job: "notjob",
          workrecord: "K20-420",
        })
      );
      await firebase.assertFails(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          hours: 5,
          workrecord: "K20-420",
        })
      );
    });
    it("requires documents with jobHours key to reference a valid job", async () => {
      const doc = dbLoggedInTimeClaim.collection("TimeEntries").doc();
      await firebase.assertSucceeds(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          job: "19-333",
          jobHours: 5,
        })
      );
      await firebase.assertFails(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          job: "notjob",
          jobHours: 5,
        })
      );
      await firebase.assertFails(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          jobHours: 5,
        })
      );
    });
    it("requires hours, jobHours, and mealsHours to be positive real numbers", async () => {
      const doc = dbLoggedInTimeClaim.collection("TimeEntries").doc();
      await firebase.assertSucceeds(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          job: "19-333",
          jobHours: 5,
        })
      );
      await firebase.assertFails(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          job: "19-333",
          jobHours: -1,
        })
      );
      await firebase.assertFails(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          job: "19-333",
          jobHours: "duck",
        })
      );

      await firebase.assertSucceeds(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          hours: 5,
        })
      );
      await firebase.assertFails(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          hours: -1,
        })
      );
      await firebase.assertFails(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          hours: "duck",
        })
      );

      await firebase.assertSucceeds(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          mealsHours: 1,
        })
      );
      await firebase.assertFails(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          mealsHours: -1,
        })
      );
      await firebase.assertFails(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          mealsHours: "duck",
        })
      );
    });
    it("requires a referenced job to be valid", async () => {
      const doc = dbLoggedInTimeClaim.collection("TimeEntries").doc();
      await firebase.assertSucceeds(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          hours: 5,
          job: "P18-123",
        })
      );
      await firebase.assertFails(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          hours: 5,
          job: "18-123",
        })
      );
    });
    it("requires workrecords to match the correct format", async () => {
      const doc = dbLoggedInTimeClaim.collection("TimeEntries").doc();
      await firebase.assertSucceeds(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          hours: 5,
          job: "19-333",
          workrecord: "Q20-423",
        })
      );
      await firebase.assertSucceeds(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          hours: 5,
          job: "19-333",
          workrecord: "K20-423-1",
        })
      );
      await firebase.assertFails(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          hours: 5,
          job: "19-333",
          workrecord: "F18-33-1",
        })
      );
      await firebase.assertFails(
        doc.set({
          uid: "alice",
          date: new Date(),
          timetype: "R",
          division: "CI",
          hours: 5,
          job: "19-333",
          workrecord: "asdf",
        })
      );
    });
  });

  describe("TimeSheets", () => {
    it("allows submission of timesheets by the owner", async () => {
      const doc = dbLoggedInTimeClaimBob
        .collection("TimeSheets")
        .doc("IG022A64Lein7bRiC5HG");
      await firebase.assertSucceeds(
        doc.set({ submitted: true }, { merge: true })
      );
    });
    it("allows the manager to read submitted timesheets they manage", async () => {
      const doc = dbLoggedInTaprClaim
        .collection("TimeSheets")
        .doc("IG022A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.get());
    });
    it("allows recall of timesheets by the owner", async () => {
      const doc = dbLoggedInTimeClaimBob
        .collection("TimeSheets")
        .doc("IG022A64Lein7bRiC5HG");
      await firebase.assertSucceeds(
        doc.set({ submitted: false }, { merge: true })
      );
    });
    it("prevents the manager from reading timesheets that aren't submitted", async () => {
      const doc = dbLoggedInTimeClaim
        .collection("TimeSheets")
        .doc("IG022A64Lein7bRiC5HG");
      await firebase.assertFails(doc.get());
    });
    it("prevents the owner from recalling approved timesheets");
    it("prevents submission of timesheets by the manager or anybody else");
    it("prevents rejected timesheets from being submitted or approved");
    it("prevents recall of timesheets by the manager or anybody else");
    it("prevents recall of approved timesheets");
  });

  describe("Profiles", () => {
    it("requires a referenced manager to be valid", async () => {
      const doc = dbLoggedInAdminClaim.collection("Profiles").doc("bob");
      await firebase.assertFails(
        doc.set({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "ronswanson",
        })
      );
      await firebase.assertSucceeds(
        doc.set({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
        })
      );
    });
    it("requires a displayName and email", async () => {
      const doc = dbLoggedInAdminClaim.collection("Profiles").doc("bob");
      await firebase.assertFails(
        doc.set({ email: "bob@example.com", managerUid: "alice" })
      );
      await firebase.assertFails(
        doc.set({ displayName: "Bob", managerUid: "alice" })
      );
      await firebase.assertSucceeds(
        doc.set({
          displayName: "Bob",
          email: "bob@example.com",
          managerUid: "alice",
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
});
