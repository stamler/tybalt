// Testing Firestore rules
const firebase = require("@firebase/testing");

const MY_PROJECT_ID = "charade-ca63f";

describe("Firestore Rules", () => {
  describe("RawLogins", () => {

    it("Allows admins to read and delete stuff", async () => {

    })
    it ("Prevents anybody else from reading or deleting stuff", async () => {

    })
    it("Prevents anybody from creating or updating stuff", async () => {
      const auth = { uid: "alice", email: "alice@example.com", admin: true };

      // Test with auth admin
      let db = firebase.initializeTestApp({projectId: MY_PROJECT_ID, auth }).firestore();
      let document = db.collection("RawLogins").doc();
      await firebase.assertFails(document.set({foo: "bar"}));

      // Test with non-auth admin
      db = firebase.initializeTestApp({projectId: MY_PROJECT_ID }).firestore();
      document = db.collection("RawLogins").doc();
      await firebase.assertFails(document.set({foo: "bar"}));
    });
  })
})