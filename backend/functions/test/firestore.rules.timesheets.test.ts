import firebase from 'firebase/compat/app';
import "mocha";
import { readFileSync } from 'fs';
import { initializeTestEnvironment, assertSucceeds, assertFails, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { setLogLevel } from "firebase/firestore";
import { addDays } from "date-fns";

const projectId = "test-app-id";

const alice = { displayName: "Alice Example", timeSheetExpected: false, email: "alice@example.com", personalVehicleInsuranceExpiry: addDays(new Date(), 7), salary: false, payrollId: 28 };
const bob = { displayName: "Bob Example", email: "bob@example.com", timeSheetExpected: true };

describe("Firestore Rules (TimeSheets)", function () {
  let testEnv: RulesTestEnvironment;
  let timeDb: firebase.firestore.Firestore;
  before(async () => {
    // https://github.com/firebase/quickstart-testing/pull/209/files#diff-6f539bff6bb3d5eeb2d2074b7d97c417466274d42384b3b8c504f94633ea3393R33
    setLogLevel("error");
    testEnv = await initializeTestEnvironment({ projectId, firestore: {
      rules: readFileSync("../firestore/firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080
    }});
    timeDb = testEnv.authenticatedContext("alice", { ...alice, time: true}).firestore();
  });

  describe("TimeSheets", () => {
    const timesheet = { uid: "bob", managerUid: "alice", submitted: false, rejected: false, approved: false, locked: false };

    beforeEach("reset data", async () => {
      await testEnv.clearFirestore();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const profiles = context.firestore().collection("Profiles");
        const timesheets = context.firestore().collection("TimeSheets");
        await timesheets.doc("IG022A64Lein7bRiC5HG").set(timesheet);
        await profiles.doc("alice").set(alice);
        await profiles.doc("bob").set(bob);
      });
    });

    it("allows owner to submit timesheets", async () => {
      const db = testEnv.authenticatedContext("bob", { ...bob, time: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertSucceeds(
        doc.set({ submitted: true }, { merge: true })
      );
    });
    it("allows owner to recall unapproved timesheets", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true });
      });
      const db = testEnv.authenticatedContext("bob", { ...bob, time: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertSucceeds(
        doc.set({ submitted: false }, { merge: true })
      );
    });
    it("allows manager (tapr) to read submitted timesheets they manage", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true });
      });
      const db = testEnv.authenticatedContext("alice", { ...alice, tapr: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertSucceeds(doc.get());
    });
    it("allows report claim holder to read any locked timesheets", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ locked: true });
      });
      const db = testEnv.authenticatedContext("alice", { ...alice, report: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertSucceeds(doc.get());
    });
    it("prevents report claim holder from reading unlocked timesheets", async () => {
      const db = testEnv.authenticatedContext("alice", { ...alice, report: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertFails(doc.get());
    });
    it("allows manager (tapr) to approve submitted timesheets they manage", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true });
      });
      const db = testEnv.authenticatedContext("alice", { ...alice, tapr: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertSucceeds(
        doc.set({ approved: true }, { merge: true })
      );
    });
    it("allows manager (tapr) to reject submitted timesheets they manage", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true });
      });
      const db = testEnv.authenticatedContext("alice", { ...alice, tapr: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertSucceeds(
        doc.set({ rejected: true, rejectorId: "alice", rejectorName: "Alice Example", rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
    });
    it("allows manager (tapr) to reject approved timesheets they manage", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true, approved: true });
      });
      const db = testEnv.authenticatedContext("alice", { ...alice, tapr: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertSucceeds(
        doc.set({ rejected: true, rejectorId: "alice", rejectorName: "Alice Example", rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
    });
    it("requires timesheet rejections to include rejectorId and rejectorName", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true });
      });
      const db = testEnv.authenticatedContext("alice", { ...alice, tapr: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertFails(
        doc.set({ rejected: true, rejectorId: "alice", rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
      await assertFails(
        doc.set({ rejected: true, rejectorName: "Alice Example", rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
      await assertSucceeds(
        doc.set({ rejected: true, rejectorId: "alice", rejectorName: "Alice Example", rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
    });
    it("allows manager (tapr) to share with up to 4 other managers (tapr) by adding them to the viewerIds array", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true });
        await adminDb.collection("ManagerNames").doc("carol").set({displayName: "Carol Example", givenName: "Carol", surname: "Example"});
        await adminDb.collection("ManagerNames").doc("jane").set({displayName: "Jane Example", givenName: "Jane", surname: "Example"});
        await adminDb.collection("ManagerNames").doc("sally").set({displayName: "Sally Example", givenName: "Sally", surname: "Example"});
        await adminDb.collection("ManagerNames").doc("stewart").set({displayName: "Stewart Example", givenName: "Stewart", surname: "Example"});
        await adminDb.collection("ManagerNames").doc("smithers").set({displayName: "Smithers Example", givenName: "Smithers", surname: "Example"});
      });
      const db = testEnv.authenticatedContext("alice", { ...alice, tapr: true }).firestore();
      const db2 = testEnv.authenticatedContext("bob", { ...bob, tapr: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      const doc2 = db2.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertFails(doc.update({ viewerIds: firebase.firestore.FieldValue.arrayUnion("chuck")} ));
      await assertFails(doc2.update({ viewerIds: firebase.firestore.FieldValue.arrayUnion("chuck")} ));
      await assertSucceeds(doc.update({ viewerIds: firebase.firestore.FieldValue.arrayUnion("carol")} ));
      await assertSucceeds(doc.update({ viewerIds: firebase.firestore.FieldValue.arrayUnion("jane","sally","stewart")} ));
      await assertFails(doc.update({ viewerIds: firebase.firestore.FieldValue.arrayUnion("smithers")} ));
    });
    it("allows manager (tapr) to unshare with other managers (tapr) by removing them from viewerIds array", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("ManagerNames").doc("carol").set({displayName: "Carol Example", givenName: "Carol", surname: "Example"});
        await adminDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true, viewerIds: ["carol", "mike"] });
      });
      const db = testEnv.authenticatedContext("alice", { ...alice, tapr: true }).firestore();
      const db2 = testEnv.authenticatedContext("bob", { ...bob, tapr: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      const doc2 = db2.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertFails( doc2.update({ viewerIds: firebase.firestore.FieldValue.arrayRemove("mike")}));
      await assertSucceeds( doc.update({ viewerIds: firebase.firestore.FieldValue.arrayRemove("mike")}));
    });
    it("allows manager (tapr) to read timesheets shared with them", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true, viewerIds: ["carol", "mike"] });
      });
      const db = testEnv.authenticatedContext("mike", { displayName: "Mike Example", tapr: true }).firestore();
      const db2 = testEnv.authenticatedContext("blake", { displayName: "Blake Example", tapr: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      const doc2 = db2.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertSucceeds(doc.get());
      await assertFails(doc2.get());
    });
    it("allows manager (tapr) mark timesheets shared with them as reviewed", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true, viewerIds: ["carol", "mike"] });
      });
      const db = testEnv.authenticatedContext("mike", { displayName: "Mike Example", tapr: true }).firestore();
      const db2 = testEnv.authenticatedContext("blake", { displayName: "Blake Example", tapr: true }).firestore();
      const db3 = testEnv.authenticatedContext("carol", { displayName: "Carol Example", tapr: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      const doc2 = db2.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      const doc3 = db3.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      // unauthorized tapr cannot update reviewedIds even if user is in viewerIds
      await assertFails(doc2.update({ reviewedIds: firebase.firestore.FieldValue.arrayUnion("mike")}));
      // authorized tapr can only add themselves to reviewedIds
      await assertFails(doc3.update({ reviewedIds: firebase.firestore.FieldValue.arrayUnion("mike")}));
      await assertSucceeds(doc.update({ reviewedIds: firebase.firestore.FieldValue.arrayUnion("mike")}));
      await assertSucceeds(doc3.update({ reviewedIds: firebase.firestore.FieldValue.arrayUnion("carol")}));
      await assertFails(doc.update({ reviewedIds: firebase.firestore.FieldValue.arrayUnion("blake")}));
    });
    it("prevents non-manager (tapr) reading timesheets shared with them", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true, viewerIds: ["carol", "mike"] });
      });
      const db = testEnv.authenticatedContext("mike", { displayName: "Mike Example", time: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertFails(doc.get());
    });
    it("allows time sheet rejector (tsrej) to reject any approved timesheet", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true, approved: true });
      });
      const db = testEnv.authenticatedContext("bob", { ...alice, tsrej: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertSucceeds(
        doc.set({ rejected: true, rejectorId: "bob", rejectorName: "Bob Example", rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
    });
    it("prevents manager (tapr) from rejecting locked timesheets they manage", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true, approved:true, locked: true });
      });
      const db = testEnv.authenticatedContext("alice", { ...alice, tapr: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertFails(
        doc.set({ rejected: true, rejectorId: "alice", rejectorName: "Alice Example", rejectionReason: "6chars", approved: false }, { merge: true })
      );
    });
    it("prevents rejected timesheets from being submitted", async () => {
      const db = testEnv.authenticatedContext("bob", { ...bob, time: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertSucceeds(
        doc.set({ submitted: true }, { merge: true })
      );
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const timesheets = context.firestore().collection("TimeSheets");
        await timesheets.doc("IG022A64Lein7bRiC5HG").set(timesheet);
        await timesheets.doc("IG022A64Lein7bRiC5HG").update({ rejected: true });
      });
      await assertFails(
        doc.set({ submitted: true }, { merge: true })
      );
    });
    it("prevents submission of timesheets by non-owner", async () => {
      const doc = timeDb.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertFails(
        doc.set({ submitted: true }, { merge: true })
      );
    });
    it("prevents recall of timesheets by the manager", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true });
      });
      const db = testEnv.authenticatedContext("alice", { ...alice, tapr: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertFails(
        doc.set({ submitted: false }, { merge: true })
      );
    });
    it("prevents recall of approved timesheets by the owner", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ approved: true });
      });
      const db = testEnv.authenticatedContext("bob", { ...bob, time: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertFails(
        doc.set({ submitted: false }, { merge: true })
      );
    });
    it("prevents the manager from reading timesheets that aren't submitted", async () => {
      const db = testEnv.authenticatedContext("alice", { ...alice, tapr: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertFails(doc.get());
    });
    it("prevents rejected timesheets from being approved", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ rejected: true });
      });
      const db = testEnv.authenticatedContext("alice", { ...alice, tapr: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertFails(
        doc.set({ approved: true }, { merge: true })
      );
    });
    it("prevents manager (tapr) from approving timesheets they do not manage", async () => {
      const db = testEnv.authenticatedContext("bob", { ...bob, tapr: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertFails(
        doc.set({ approved: true }, { merge: true })
      );
    });
    it("prevents manager (tapr) from approving unsubmitted timesheets", async () => {
      const db = testEnv.authenticatedContext("bob", { ...bob, tapr: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertFails(
        doc.set({ approved: true }, { merge: true })
      );
    });
    it("prevents manager (tapr) from rejecting unsubmitted timesheets they manage", async () => {
      const db = testEnv.authenticatedContext("alice", { ...alice, tapr: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertFails(
        doc.set({ rejected: true, rejectorId: "alice", rejectorName: "Alice Example", rejectionReason: "6chars" }, { merge: true })
      );
    });
    it("prevents manager (tapr) from rejecting timesheets they do not manage", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true });
      });
      const db = testEnv.authenticatedContext("bob", { ...bob, tapr: true }).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertFails(
        doc.set({ rejected: true, rejectorId: "bob", rejectorName: "Bob Example",  rejectionReason: "6chars" }, { merge: true })
      );
    });
    it("prevents non-managers (no tapr) from approving timesheets even if they're listed as manager", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true });
      });
      const db = testEnv.authenticatedContext("alice", alice).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertFails(
        doc.set({ approved: true }, { merge: true })
      );
    });
    it("prevents non-managers (no tapr) from rejecting timesheets even if they're listed as manager", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("TimeSheets").doc("IG022A64Lein7bRiC5HG").update({ submitted: true });
      });
      const db = testEnv.authenticatedContext("alice", alice).firestore();
      const doc = db.collection("TimeSheets").doc("IG022A64Lein7bRiC5HG");
      await assertFails(
        doc.set({ rejected: true, rejectorId: "alice", rejectorName: "Alice Example", rejectionReason: "6chars" }, { merge: true })
      );
    });
  });
});