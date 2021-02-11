// Testing Firestore rules
const firebase = require("@firebase/testing");

const MY_PROJECT_ID = "charade-ca63f";

const auth = { uid: "alice", email: "alice@example.com" };
const dbLoggedInTimeClaim = firebase
  .initializeTestApp({
    projectId: MY_PROJECT_ID,
    auth: { ...auth, time: true },
  })
  .firestore();

describe("Firestore Rules", () => {

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

});
