import * as firebase from "@firebase/rules-unit-testing";
import "mocha";
import { addDays } from "date-fns";

const projectId = "test-app-id";

const alice = { displayName: "Alice Example", timeSheetExpected: false, email: "alice@example.com", personalVehicleInsuranceExpiry: addDays(new Date(), 7), salary: false, payrollId: 28 };
const bob = { displayName: "Bob Example", email: "bob@example.com", timeSheetExpected: true };
const adminDb = firebase.initializeAdminApp({ projectId }).firestore();
const timeDb = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, time: true } }).firestore();
const profiles = adminDb.collection("Profiles");

describe("Firestore Rules (TimeSheets)", function () {
  this.timeout(3000);
  describe("TimeSheets", () => {
    const timesheet = { uid: "bob", managerUid: "alice", submitted: false, rejected: false, approved: false, locked: false };
    const timesheets = adminDb.collection("TimeSheets");

    beforeEach("reset data", async () => {
      await firebase.clearFirestoreData({ projectId });
      await timesheets.doc("IG022A64Lein7bRiC5HG").set(timesheet);
      await profiles.doc("alice").set(alice);
      await profiles.doc("bob").set(bob);
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
        doc.set({ rejected: true, rejectorId: "alice", rejectorName: "Alice Example", rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
    });
    it("allows manager (tapr) to reject approved timesheets they manage", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true, approved: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, tapr: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertSucceeds(
        doc.set({ rejected: true, rejectorId: "alice", rejectorName: "Alice Example", rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
    });
    it("requires timesheet rejections to include rejectorId and rejectorName", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, tapr: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ rejected: true, rejectorId: "alice", rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
      await firebase.assertFails(
        doc.set({ rejected: true, rejectorName: "Alice Example", rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
      await firebase.assertSucceeds(
        doc.set({ rejected: true, rejectorId: "alice", rejectorName: "Alice Example", rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
    });
    it("allows manager (tapr) to share with up to 4 other managers (tapr) by adding them to the viewerIds array", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true });
      await adminDb.collection("ManagerNames").doc("carol").set({displayName: "Carol Example", givenName: "Carol", surname: "Example"});
      await adminDb.collection("ManagerNames").doc("jane").set({displayName: "Jane Example", givenName: "Jane", surname: "Example"});
      await adminDb.collection("ManagerNames").doc("sally").set({displayName: "Sally Example", givenName: "Sally", surname: "Example"});
      await adminDb.collection("ManagerNames").doc("stewart").set({displayName: "Stewart Example", givenName: "Stewart", surname: "Example"});
      await adminDb.collection("ManagerNames").doc("smithers").set({displayName: "Smithers Example", givenName: "Smithers", surname: "Example"});
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, tapr: true } }).firestore();
      const db2 = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, tapr: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      const doc2 = db2.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertFails(doc.update({ viewerIds: firebase.firestore.FieldValue.arrayUnion("chuck")} ));
      await firebase.assertFails(doc2.update({ viewerIds: firebase.firestore.FieldValue.arrayUnion("chuck")} ));
      await firebase.assertSucceeds(doc.update({ viewerIds: firebase.firestore.FieldValue.arrayUnion("carol")} ));
      await firebase.assertSucceeds(doc.update({ viewerIds: firebase.firestore.FieldValue.arrayUnion("jane","sally","stewart")} ));
      await firebase.assertFails(doc.update({ viewerIds: firebase.firestore.FieldValue.arrayUnion("smithers")} ));
    });
    it("allows manager (tapr) to unshare with other managers (tapr) by removing them from viewerIds array", async () => {
      await adminDb.collection("ManagerNames").doc("carol").set({displayName: "Carol Example", givenName: "Carol", surname: "Example"});
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true, viewerIds: ["carol", "mike"] });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, tapr: true } }).firestore();
      const db2 = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, tapr: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      const doc2 = db2.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertFails( doc2.update({ viewerIds: firebase.firestore.FieldValue.arrayRemove("mike")}));
      await firebase.assertSucceeds( doc.update({ viewerIds: firebase.firestore.FieldValue.arrayRemove("mike")}));
    });
    it("allows manager (tapr) to read timesheets shared with them", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true, viewerIds: ["carol", "mike"] });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "mike", displayName: "Mike Example", tapr: true } }).firestore();
      const db2 = firebase.initializeTestApp({ projectId, auth: { uid: "blake", displayName: "Blake Example", tapr: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      const doc2 = db2.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.get());
      await firebase.assertFails(doc2.get());
    });
    it("allows manager (tapr) mark timesheets shared with them as reviewed", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true, viewerIds: ["carol", "mike"] });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "mike", displayName: "Mike Example", tapr: true } }).firestore();
      const db2 = firebase.initializeTestApp({ projectId, auth: { uid: "blake", displayName: "Blake Example", tapr: true } }).firestore();
      const db3 = firebase.initializeTestApp({ projectId, auth: { uid: "carol", displayName: "Carol Example", tapr: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      const doc2 = db2.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      const doc3 = db3.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      // unauthorized tapr cannot update reviewedIds even if user is in viewerIds
      await firebase.assertFails(doc2.update({ reviewedIds: firebase.firestore.FieldValue.arrayUnion("mike")}));
      // authorized tapr can only add themselves to reviewedIds
      await firebase.assertFails(doc3.update({ reviewedIds: firebase.firestore.FieldValue.arrayUnion("mike")}));
      await firebase.assertSucceeds(doc.update({ reviewedIds: firebase.firestore.FieldValue.arrayUnion("mike")}));
      await firebase.assertSucceeds(doc3.update({ reviewedIds: firebase.firestore.FieldValue.arrayUnion("carol")}));
      await firebase.assertFails(doc.update({ reviewedIds: firebase.firestore.FieldValue.arrayUnion("blake")}));
    });
    it("prevents non-manager (tapr) reading timesheets shared with them", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true, viewerIds: ["carol", "mike"] });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "mike", displayName: "Mike Example", time: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertFails(doc.get());
    });
    it("allows time sheet rejector (tsrej) to reject any approved timesheet", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true, approved: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...alice, tsrej: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertSucceeds(
        doc.set({ rejected: true, rejectorId: "bob", rejectorName: "Bob Example", rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
    });
    it("prevents manager (tapr) from rejecting locked timesheets they manage", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true, approved:true, locked: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, tapr: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ rejected: true, rejectorId: "alice", rejectorName: "Alice Example", rejectionReason: "6chars", approved: false }, { merge: true })
      );
    });
    it("prevents rejected timesheets from being submitted", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, time: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertSucceeds(
        doc.set({ submitted: true }, { merge: true })
      );
      await timesheets.doc("IG022A64Lein7bRiC5HG").set(timesheet);
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ rejected: true });
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
        doc.set({ rejected: true, rejectorId: "alice", rejectorName: "Alice Example", rejectionReason: "6chars" }, { merge: true })
      );
    });
    it("prevents manager (tapr) from rejecting timesheets they do not manage", async () => {
      await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, tapr: true } }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ rejected: true, rejectorId: "bob", rejectorName: "Bob Example",  rejectionReason: "6chars" }, { merge: true })
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
        doc.set({ rejected: true, rejectorId: "alice", rejectorName: "Alice Example", rejectionReason: "6chars" }, { merge: true })
      );
    });
  });
});