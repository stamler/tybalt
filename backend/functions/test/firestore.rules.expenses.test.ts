import firebase from 'firebase/compat/app';
import "mocha";
import { readFileSync } from 'fs';
import { initializeTestEnvironment, assertSucceeds, assertFails, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { serverTimestamp, setLogLevel } from "firebase/firestore";
import { addDays, subDays } from "date-fns";

const projectId = "test-app-id";

const alice = { displayName: "Alice Example", timeSheetExpected: false, email: "alice@example.com", personalVehicleInsuranceExpiry: addDays(new Date(), 7), salary: false, payrollId: 28 };
const bob = { displayName: "Bob Example", email: "bob@example.com", timeSheetExpected: true };

describe("Firestore Rules (Expenses)", function () {
  let testEnvironment: RulesTestEnvironment;
  let timeDb: firebase.firestore.Firestore;
  before(async () => {
    // https://github.com/firebase/quickstart-testing/pull/209/files#diff-6f539bff6bb3d5eeb2d2074b7d97c417466274d42384b3b8c504f94633ea3393R33
    setLogLevel("error");
    testEnvironment = await initializeTestEnvironment({ projectId, firestore: {
      rules: readFileSync("../firestore/firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080
    }});
    timeDb = testEnvironment.authenticatedContext("alice", { ...alice, time: true}).firestore();
  });
  
  // this.timeout(3000);
  describe("Expenses", () => {
    const baseline = { uid: "alice", displayName: "Alice Example", surname: "Example", givenName: "Alice", date: new Date(), total: 50, description: "Monthly recurring expense", submitted: false, approved: false, managerUid: "bob", managerName: "Bob Example", division: "ABC", divisionName: "Playtime", paymentType: "Expense", vendorName: "Super vendor", attachment: "foo", payrollId: 28 };
    const expenseJobProperties = { job: "19-333", jobDescription: "Big job for a client", client: "A special client" };
    const division = { name: "Playtime" };

    beforeEach("reset data", async () => {
      await testEnvironment.clearFirestore();
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Jobs").doc("19-333").set({ description: "Big job for a client", client: "A special client" });
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").set(baseline);
        await adminDb.collection("Divisions").doc("ABC").set(division);
        await adminDb.collection("Profiles").doc("alice").set(alice);
        await adminDb.collection("Profiles").doc("bob").set(bob);
      });
    });

    it("allows owner to read their own Expenses if they have time claim", async () => {
      const doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertSucceeds(doc.get())
    });
    it("allows owner to create expenses", async () => {
      const doc = timeDb.collection("Expenses").doc("newExpense");
      await assertSucceeds(
        doc.set(baseline)
      );
    });
    it("prevents owner from creating expense that's already approved or committed", async () => {
      const doc = timeDb.collection("Expenses").doc("newExpense");
      const {approved, ...noApproved} = baseline;
      await assertFails(
        doc.set({...noApproved, approved: true})
      );
      await assertFails(
        doc.set({...noApproved, approved: true, committed: true})
      );
      await assertFails(
        doc.set({...noApproved, committed: true})
      );
    });
    it("allows owner to submit expenses", async () => {
      const doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertSucceeds(
        doc.set({ submitted: true }, { merge: true })
      );
    });
    it("prevents owner from approving or committing their own expenses", async () => {
      const doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertFails(
        doc.set({ submitted: true, approved: true }, { merge: true })
      );
      await assertFails(
        doc.set({ submitted: true, committed: true }, { merge: true })
      );
      await assertFails(
        doc.set({ submitted: true, approved: true, committed: true }, { merge: true })
      );
    });
    it("allows owner to submit and approve expenses simultaneously if they have tapr claim and are their own manager", async () => {
      const { managerUid, managerName, ...noManager } = baseline;
      testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").set({ managerUid: "alice", managerName: "Alice Example", ...noManager});
      });      
      let doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertFails(
        doc.set({ submitted: true, approved: true, committed: false }, { merge: true })
      );
      const db = testEnvironment.authenticatedContext("alice", { ...alice, tapr: true}).firestore();
      doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertFails(
        doc.set({ submitted: true, approved: true, committed: true }, { merge: true })
      );
      await assertSucceeds(
        doc.set({ submitted: true, approved: true, committed: false }, { merge: true })
      );
    });
    it("prevents rejected expenses from being submitted", async () => {
      const doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ rejected: true });
      });      
      await assertFails(
        doc.set({ submitted: true }, { merge: true })
      );
    });
    it("allows owner to delete their own Expenses if they have time claim", async () => {
      const doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertSucceeds(doc.delete())
    });
    it("allows owner to recall unapproved Expenses and prevents recall of approved ones", async () => {
      // unapproved
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true });
      });      
      const doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertSucceeds(doc.update({ submitted: false }));
      // approved
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true });
      });      
      await assertFails(doc.update({ submitted: false }));
    });
    it("allows owner to recall rejected Expenses", async () => {
      // rejected
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: false, rejected: true, rejectionReason: "A specific reason" });
      });      
      const doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertSucceeds(doc.update({ submitted: false }));
    });
    it("allows manager (tapr) to read submitted Expenses they manage", async () => {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true });
      });      
      const db = testEnvironment.authenticatedContext("bob", { ...bob, tapr: true}).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertSucceeds(doc.get());
    });
    it("prevents manager (tapr) from approving Expenses they do not manage", async () => {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true });
      });      
      let db = testEnvironment.authenticatedContext("bob", { ...bob, tapr: true}).firestore();
      let doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertSucceeds(
        doc.set({ approved: true, committed: false }, { merge: true })
      );
      db = testEnvironment.authenticatedContext("alice", { ...bob, tapr: true}).firestore();
      doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertFails(
        doc.set({ approved: true, committed: false }, { merge: true })
      );
    });
    it("prevents manager (tapr) from approving unsubmitted Expenses", async () => {
      const db = testEnvironment.authenticatedContext("bob", { ...bob, tapr: true}).firestore();
      let doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertFails(
        doc.set({ approved: true, committed: false }, { merge: true })
      );
    });

    it("allows manager (eapr) to read any approved Expenses", async () => {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, managerUid: "alice" });
      });      
      const db = testEnvironment.authenticatedContext("bob", { ...bob, eapr: true}).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertSucceeds(doc.get());
    });
    it("allows report claim holder to read any committed Expenses", async () => {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, managerUid: "alice", committed: true });
      });      
      const db = testEnvironment.authenticatedContext("bob", { ...bob, report: true}).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertSucceeds(doc.get());
    });
    it("prevents report claim holder from reading any unsubmitted Expenses", async () => {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: false, approved: false, managerUid: "alice", committed: false });
      });      
      const db = testEnvironment.authenticatedContext("bob", { ...bob, report: true}).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertFails(doc.get());
    });
    it("allows report claim holder to read any submitted Expenses", async () => {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: false, managerUid: "alice", committed: false });
      });      
      const db = testEnvironment.authenticatedContext("bob", { ...bob, report: true}).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertSucceeds(doc.get());
    });
    it("prevents owner from deleting their own Expenses if they are submitted", async () => {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true });
      });      
      const doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertFails(doc.delete())
    });
    it("prevents owner from deleting their own Expenses if they are approved", async () => {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true });
      });      
      const doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertFails(doc.delete())
    });
    it("prevents manager from deleting Expenses they manage", async () => {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true });
      });      
      const db = testEnvironment.authenticatedContext("bob", { ...bob, tapr: true}).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertFails(doc.delete())
    });
    it("prevents owner from reading their own Expenses if they have no time claim", async () => {
      const db = testEnvironment.authenticatedContext("alice", { ...alice}).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertFails(doc.get())
    });
    it("prevents manager (tapr) from reading submitted Expenses they do not manage", async () => {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, managerUid: "alice" });
      });      
      const db = testEnvironment.authenticatedContext("bob", { ...bob, tapr: true}).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertFails(doc.get());
    });
    it("prevents user with managerUid from reading submitted Expenses if they are missing tapr claim", async () => {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true });
      });      
      const db = testEnvironment.authenticatedContext("bob", { ...bob}).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertFails(doc.get());
    });
    it("prevents manager (tapr) from reading unsubmitted Expenses they manage", async () => {
      const db = testEnvironment.authenticatedContext("bob", { ...bob, tapr: true}).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertFails(doc.get());
    });
    it("prevents manager (eapr) from reading unapproved Expenses", async () => {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, managerUid: "alice" });
      });      
      const db = testEnvironment.authenticatedContext("bob", { ...bob, eapr: true}).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertFails(doc.get());
    });
    it("requires submitted uid to match the authenticated user id", async () => {
      const doc = timeDb.collection("Expenses").doc();
      await assertSucceeds(doc.set(baseline));
      const { uid, ...missingUid } = baseline;
      await assertFails(doc.set({ uid: "bob", ...missingUid }));
    });
    it("requires documents not have unspecified fields", async () => {
      const doc = timeDb.collection("Expenses").doc();
      await assertSucceeds(doc.set(baseline));
      await assertFails(doc.set({ ...baseline, foo: "bar" }));
    });
    it("rejects Mileage Expenses where the user doesn't have valid personal car insurance on their profile", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const {vendorName, paymentType, attachment, total,...missingPaymentTypeAndAttachmentAndTotal } = baseline;
      await assertSucceeds(doc.set({ paymentType: "Mileage", distance: 5, ...missingPaymentTypeAndAttachmentAndTotal }));
      const { personalVehicleInsuranceExpiry, ...missingPersonalVehicleInsuranceExpiry } = alice;
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Profiles").doc("alice").set({personalVehicleInsuranceExpiry: subDays(new Date(), 7), ...missingPersonalVehicleInsuranceExpiry});
      });
      await assertFails(doc.set({ paymentType: "Mileage", distance: 6, ...missingPaymentTypeAndAttachmentAndTotal }));
    });
    it("requires any referenced job to be valid", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { job, ...missingJob } = expenseJobProperties;
      await assertSucceeds(doc.set({ ...baseline, ...missingJob, job:"19-333", description: "Big job for a client", client: "A special client" }));
      await assertFails(doc.set({ ...baseline, ...missingJob, job:"20-333", description: "Big job for a client", client: "A special client" }));
    });
    it("requires division to be present and valid", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { division, ...missingDivision } = baseline;
      await assertFails(doc.set(missingDivision));
      await assertFails(doc.set({ division: "DEF", ...missingDivision }));
      await assertSucceeds(doc.set({ division: "ABC", ...missingDivision }));
    });
    it("requires total to be positive number if paymentType is not Mileage", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, total, ...missingPaymentTypeAndTotal } = baseline;
      await assertFails(doc.set({paymentType: "Expense",...missingPaymentTypeAndTotal}));
      await assertFails(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", ...missingPaymentTypeAndTotal}));
      await assertFails(doc.set({paymentType: "CorporateCreditCard", ccLast4digits: "1234",...missingPaymentTypeAndTotal}));
      await assertFails(doc.set({paymentType: "Expense", total: -50.5, ...missingPaymentTypeAndTotal}));
      await assertSucceeds(doc.set({paymentType: "Expense", total: 50.5, ...missingPaymentTypeAndTotal}));
      await assertSucceeds(doc.set({paymentType: "CorporateCreditCard", ccLast4digits: "1234", total: 50.5, ...missingPaymentTypeAndTotal}));
      await assertSucceeds(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", total: 50.5, ...missingPaymentTypeAndTotal}));
    });
    it("requires vendor if paymentType is CorporateCreditCard, FuelCard, Expense, or FuelOnAccount", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, vendorName, ...missingPaymentTypeAndVendor } = baseline;
      const { description, ...missingDescriptionToo } = missingPaymentTypeAndVendor;
      await assertFails(doc.set({paymentType: "Expense", ...missingPaymentTypeAndVendor}));
      await assertSucceeds(doc.set({paymentType: "Expense", vendorName: "foo", ...missingPaymentTypeAndVendor}));
      await assertFails(doc.set({paymentType: "CorporateCreditCard", ccLast4digits: "1234", ...missingPaymentTypeAndVendor}));
      await assertSucceeds(doc.set({paymentType: "CorporateCreditCard", ccLast4digits: "1234", vendorName: "foo", ...missingPaymentTypeAndVendor}));
      await assertFails(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", ...missingPaymentTypeAndVendor}));
      await assertSucceeds(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", vendorName: "foo", ...missingPaymentTypeAndVendor}));
      await assertFails(doc.set({paymentType: "FuelOnAccount", unitNumber: 10, ...missingDescriptionToo}));
      //await assertSucceeds(doc.set({paymentType: "FuelOnAccount", unitNumber: 10, vendorName: "foo", ...missingDescriptionToo}));
    });
    it("requires attachment if paymentType is CorporateCreditCard, FuelCard or Expense, but FuelOnAccount does not require attachment", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, attachment, ...missingPaymentTypeAndAttachment } = baseline;
      //const { description, ...missingDescriptionToo } = missingPaymentTypeAndAttachment;
      await assertFails(doc.set({paymentType: "Expense", ...missingPaymentTypeAndAttachment}));
      await assertSucceeds(doc.set({paymentType: "Expense", attachment: "foo", ...missingPaymentTypeAndAttachment}));
      //await assertSucceeds(doc.set({paymentType: "FuelOnAccount", unitNumber: 25, ...missingDescriptionToo}));
      await assertFails(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", ...missingPaymentTypeAndAttachment}));
      await assertFails(doc.set({paymentType: "CorporateCreditCard", ccLast4digits: "1234", ...missingPaymentTypeAndAttachment}));
      //await assertSucceeds(doc.set({paymentType: "FuelOnAccount", unitNumber: 25, attachment: "foo", ...missingDescriptionToo}));
      await assertSucceeds(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", attachment: "foo", ...missingPaymentTypeAndAttachment}));
      await assertSucceeds(doc.set({paymentType: "CorporateCreditCard", ccLast4digits: "1234", attachment: "foo", ...missingPaymentTypeAndAttachment}));
    });
    it("requires ccLast4digits be 4 character number-only string if paymentType is either CorporateCreditCard or FuelCard", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, ...missingPaymentType } = baseline;
      await assertFails(doc.set({paymentType: "FuelCard", ...missingPaymentType }));
      await assertFails(doc.set({paymentType: "CorporateCreditCard", ...missingPaymentType }));
      await assertSucceeds(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", ...missingPaymentType }));
      await assertSucceeds(doc.set({paymentType: "CorporateCreditCard", ccLast4digits: "5678", ...missingPaymentType }));
    });
    it("requires ccLast4digits be missing if paymentType is not CorporateCreditCard or FuelCard", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, ...missingPaymentType } = baseline;
      await assertFails(doc.set({paymentType: "Expense", ccLast4digits: "1234", ...missingPaymentType }));
      await assertSucceeds(doc.set({paymentType: "Expense", ...missingPaymentType }));
    });
    it("requires po to be missing if paymentType FuelCard or FuelOnAccount", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, ...missingPaymentType } = baseline;
      const { description, ...missingDescriptionToo } = missingPaymentType
      await assertFails(doc.set({paymentType: "FuelCard", po: "5126", ccLast4digits: "1234", ...missingPaymentType }));
      await assertSucceeds(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", ...missingPaymentType }));
      await assertFails(doc.set({paymentType: "FuelOnAccount", po: "5126", unitNumber: 25, ...missingDescriptionToo }));
      //await assertSucceeds(doc.set({paymentType: "FuelOnAccount", unitNumber: 25, ...missingDescriptionToo }));
    });
    it("requires unitNumber to be missing if paymentType not FuelOnAccount", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, ...missingPaymentType } = baseline;
      await assertFails(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", unitNumber: 25, ...missingPaymentType }));
      await assertSucceeds(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", ...missingPaymentType }));
    });
    /*
    it("requires unitNumber to be positive integer if paymentType is FuelOnAccount", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, description, ...missingPaymentTypeAndDescription } = baseline;
      await assertFails(doc.set({paymentType: "FuelOnAccount", ...missingPaymentTypeAndDescription }));
      await assertFails(doc.set({paymentType: "FuelOnAccount", unitNumber: -25, ...missingPaymentTypeAndDescription }));
      await assertFails(doc.set({paymentType: "FuelOnAccount", unitNumber: 0.5, ...missingPaymentTypeAndDescription }));
      await assertFails(doc.set({paymentType: "FuelOnAccount", unitNumber: 0, ...missingPaymentTypeAndDescription }));
      await assertSucceeds(doc.set({paymentType: "FuelOnAccount", unitNumber: 25, ...missingPaymentTypeAndDescription }));
    });
    */
    it("requires paymentType to be one of CorporateCreditCard, Expense, Mileage, FuelCard, Allowance, PersonalReimbursement", async () => {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Profiles").doc("alice").update({allowPersonalReimbursement: true});
      });
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, vendorName, ...missingPaymentType } = baseline;
      const { total, ...missingPaymentTypeAndTotal } = missingPaymentType;
      const { attachment, ...missingPaymentTypeAndTotalAndAttachment } = missingPaymentTypeAndTotal;
      const { description, ...missingPaymentTypeAndTotalAndAttachmentAndDescription } = missingPaymentTypeAndTotalAndAttachment;
      await assertFails(doc.set(missingPaymentType));
      await assertFails(doc.set({ paymentType: "DEF", ...missingPaymentType }));
      await assertSucceeds(doc.set({ paymentType: "Mileage", distance: 5, ...missingPaymentTypeAndTotalAndAttachment }));
      await assertSucceeds(doc.set({ paymentType: "CorporateCreditCard", vendorName: "foo", ccLast4digits: "1234", ...missingPaymentType }));
      await assertSucceeds(doc.set({ paymentType: "FuelCard", vendorName: "foo", ccLast4digits: "1234", ...missingPaymentType }));
      await assertFails(doc.set({ paymentType: "FuelOnAccount", total:50, vendorName: "foo", unitNumber: 1234, ...missingPaymentTypeAndTotalAndAttachmentAndDescription }));
      await assertSucceeds(doc.set({ paymentType: "Expense", vendorName: "foo", ...missingPaymentType }));
      await assertSucceeds(doc.set({ paymentType: "Allowance", breakfast: true, lunch: true, dinner:true, lodging:false, ...missingPaymentTypeAndTotalAndAttachmentAndDescription }));
      await assertSucceeds(doc.set({ paymentType: "PersonalReimbursement", total: 100, ...missingPaymentTypeAndTotalAndAttachment}));
    });
    it("requires PersonalReimbursement expenses to have only total and description with optional job", async () => {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Profiles").doc("alice").update({allowPersonalReimbursement: true});
      });
      const doc = timeDb.collection("Expenses").doc();
      const {vendorName, paymentType, attachment, ...prbase } = baseline;
      await assertSucceeds(doc.set({paymentType: "PersonalReimbursement",...prbase}));
      await assertSucceeds(doc.set({paymentType: "PersonalReimbursement",...prbase, job:"19-333", jobDescription: "Big job for a client", client: "A special client" }));
      await assertFails(doc.set({paymentType: "PersonalReimbursement",...prbase, job:"19-333", client: "A special client" }));
      await assertFails(doc.set({paymentType: "PersonalReimbursement", breakfast: true,...prbase}));
      await assertFails(doc.set({paymentType: "PersonalReimbursement", vendorName: "Some vendor",...prbase}));
      await assertFails(doc.set({paymentType: "PersonalReimbursement", ccLast4digits: "1234",...prbase}));
      await assertFails(doc.set({paymentType: "PersonalReimbursement", unitNumber: 12,...prbase}));
      await assertFails(doc.set({paymentType: "PersonalReimbursement", attachment: "asdf",...prbase}));
      await assertFails(doc.set({paymentType: "PersonalReimbursement", distance: 5,...prbase}));
      await assertFails(doc.set({paymentType: "PersonalReimbursement", po: "235",...prbase}));
    });
    it("requires PersonalReimbursement expenses to have proper flag on profile", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const {vendorName, paymentType, attachment, ...prbase } = baseline;
      await assertFails(doc.set({paymentType: "PersonalReimbursement",...prbase}));
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Profiles").doc("alice").update({allowPersonalReimbursement: true});
      });
      await assertSucceeds(doc.set({paymentType: "PersonalReimbursement",...prbase}));
    });
    it("requires Allowance expenses to have boolean breakfast, lunch, dinner, and lodging properties", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const skeleton = { uid: "alice", displayName: "Alice Example", surname: "Example", givenName: "Alice", date: new Date(), submitted: false, approved: false, managerUid: "bob", managerName: "Bob Example", division: "ABC", divisionName: "Playtime", paymentType: "Allowance", payrollId: 28 };
      await assertFails(doc.set(skeleton));
      await assertFails(doc.set({breakfast: true, ...skeleton}));
      await assertFails(doc.set({breakfast: "true", lunch: 56, dinner:false, lodging: false, ...skeleton}));
      await assertSucceeds(doc.set({breakfast: true, lunch: true, dinner:false, lodging: false, ...skeleton}));
    });
    it("requires Allowance expenses to have true value for at least one of breakfast, lunch, dinner, and lodging properties", async() => {
      const doc = timeDb.collection("Expenses").doc();
      const skeleton = { uid: "alice", displayName: "Alice Example", surname: "Example", givenName: "Alice", date: new Date(), submitted: false, approved: false, managerUid: "bob", managerName: "Bob Example", division: "ABC", divisionName: "Playtime", paymentType: "Allowance", payrollId: 28 };
      await assertFails(doc.set({breakfast: false, lunch: false, dinner:false, lodging: false, ...skeleton}));
      await assertSucceeds(doc.set({breakfast: true, lunch: false, dinner:false, lodging: false, ...skeleton}));
    });
    it("requires Allowance expenses to not have description or total properties", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const skeleton = { uid: "alice", displayName: "Alice Example", surname: "Example", givenName: "Alice", date: new Date(), submitted: false, approved: false, managerUid: "bob", managerName: "Bob Example", division: "ABC", divisionName: "Playtime", paymentType: "Allowance", payrollId: 28 };
      await assertFails(doc.set({ description: "Meals", breakfast: true, lunch: true, dinner:false, lodging: false, ...skeleton}));
      await assertFails(doc.set({ total: 50, breakfast: true, lunch: true, dinner:false, lodging: true, ...skeleton}));
      await assertSucceeds(doc.set({breakfast: true, lunch: true, dinner:false, lodging: true, ...skeleton}));
    });
    /*
    it("requires FuelOnAccount expenses to not have description", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, description, ...missing } = baseline;
      await assertFails(doc.set({ paymentType: "FuelOnAccount", unitNumber:10, description: "4chars", ...missing}));
      await assertSucceeds(doc.set({ paymentType: "FuelOnAccount", unitNumber:10, ...missing}));
    });
    */
    it("allows Allowance entries to have an associated job that exists", async() => {
      const doc = timeDb.collection("Expenses").doc();
      const skeleton = { uid: "alice", displayName: "Alice Example", surname: "Example", givenName: "Alice", date: new Date(), submitted: false, approved: false, managerUid: "bob", managerName: "Bob Example", division: "ABC", divisionName: "Playtime", paymentType: "Allowance", payrollId: 28 };
      await assertFails(doc.set({breakfast: true, lunch: true, dinner:true, lodging: true, job:"19-332", jobDescription: "Big job for a client", client: "A special client", ...skeleton}));      
      await assertSucceeds(doc.set({breakfast: true, lunch: true, dinner:true, lodging: true, job:"19-333", jobDescription: "Big job for a client", client: "A special client", ...skeleton}));      
    });
    it("requires distance to be integer > 0 if paymentType is Mileage", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { vendorName, paymentType, total, attachment, ...missingPaymentTypeAndTotalAndAttachment } = baseline;
      await assertSucceeds(doc.set({ paymentType: "Mileage", distance: 5, ...missingPaymentTypeAndTotalAndAttachment }));
      await assertFails(doc.set({ paymentType: "Mileage", distance: -1, ...missingPaymentTypeAndTotalAndAttachment }));
      await assertFails(doc.set({ paymentType: "Mileage", distance: 0.5, ...missingPaymentTypeAndTotalAndAttachment }));
      await assertFails(doc.set({ paymentType: "Mileage", distance: "foo", ...missingPaymentTypeAndTotalAndAttachment }));
      await assertFails(doc.set({ paymentType: "Mileage", ...missingPaymentTypeAndTotalAndAttachment }));
    });
    it("requires po, vendorName, attachment, total to be missing if paymentType is Mileage", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { vendorName, paymentType, total, attachment, ...missingPaymentTypeAndTotalAndAttachment } = baseline;
      await assertSucceeds(doc.set({ paymentType: "Mileage", distance: 5, ...missingPaymentTypeAndTotalAndAttachment }));
      await assertFails(doc.set({ paymentType: "Mileage", distance: 5, po: "foo", ...missingPaymentTypeAndTotalAndAttachment }));
      await assertFails(doc.set({ paymentType: "Mileage", distance: 5, vendorName: "foo", ...missingPaymentTypeAndTotalAndAttachment }));
      await assertFails(doc.set({ paymentType: "Mileage", distance: 5, attachment: "foo", ...missingPaymentTypeAndTotalAndAttachment }));
      await assertFails(doc.set({ paymentType: "Mileage", distance: 5, total: 55, ...missingPaymentTypeAndTotalAndAttachment }));
    });
    it("requires distance to missing if paymentType is not Mileage", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, ...missingPaymentType } = baseline;
      await assertSucceeds(doc.set({ paymentType: "Expense", ...missingPaymentType}));
      await assertFails(doc.set({ paymentType: "Expense", distance: 5, ...missingPaymentType}));
    });
    it("allows documents to have vendorName field", async () => {
      const doc = timeDb.collection("Expenses").doc();
      await assertSucceeds(doc.set(baseline));
      await assertSucceeds(doc.set({ ...baseline, vendorName: "Foobar Company" }));
    });
    it("rejects expenses with leading/trailing whitespace in description", async () => {
      const doc = timeDb.collection("Expenses").doc();
      await assertFails(doc.set({ ...baseline, description: " leading space" }));
      await assertFails(doc.set({ ...baseline, description: "trailing space " }));
      await assertSucceeds(doc.set({ ...baseline, description: "no extra spaces" }));
    });
    it("rejects expenses with leading/trailing whitespace in vendorName", async () => {
      const doc = timeDb.collection("Expenses").doc();
      await assertFails(doc.set({ ...baseline, vendorName: " leading" }));
      await assertFails(doc.set({ ...baseline, vendorName: "trailing " }));
      await assertSucceeds(doc.set({ ...baseline, vendorName: "Normal Vendor" }));
    });
    it("allows manager (tapr) to reject submitted expenses they manage", async () => {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: false });
      });      
      let db = testEnvironment.authenticatedContext("alice", { ...bob, tapr: true}).firestore();
      let doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertFails(
        doc.set({ rejected: true, rejectorId: "alice", rejectorName: "Alice Example", rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
      db = testEnvironment.authenticatedContext("bob", { ...bob, tapr: true}).firestore();
      doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertSucceeds(
        doc.set({ rejected: true, rejectorId: "bob", rejectorName: "Bob Example",  rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
    });
    it("requires expense rejections to include rejectorId and rejectorName", async () => {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: false });
      });      
      const db = testEnvironment.authenticatedContext("bob", { ...bob, tapr: true}).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertFails(
        doc.set({ rejected: true, rejectorId: "bob",  rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
      await assertFails(
        doc.set({ rejected: true, rejectorName: "Bob Example",  rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
      await assertSucceeds(
        doc.set({ rejected: true, rejectorId: "bob", rejectorName: "Bob Example",  rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
    });
    it("allows manager (eapr) to commit approved expenses", async () => {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, managerUid: "alice" });
      });      
      const db = testEnvironment.authenticatedContext("bob", { ...bob, eapr: true}).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertSucceeds(doc.update({
        exported: false,
        committed: true,
        commitTime: serverTimestamp(),
        commitUid: "bob",
        commitName: "Bob Example",
      }));
    });
    it("prevents manager (eapr) from committing approved expenses if writing a UID other than their own", async () => {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, managerUid: "alice" });
      });      
      const db = testEnvironment.authenticatedContext("bob", { ...bob, eapr: true}).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertFails(doc.update({ 
        exported: false,
        committed: true,
        commitTime: serverTimestamp(),
        commitUid: "alice",
        commitName: "Bob Example",
      }));
      await assertSucceeds(doc.update({ 
        exported: false,
        committed: true,
        commitTime: serverTimestamp(),
        commitUid: "bob",
        commitName: "Bob Example",
      }));
    });
    it("prevents manager (eapr) from committing unapproved expenses", async () => {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: false, managerUid: "alice" });
      });      
      const db = testEnvironment.authenticatedContext("bob", { ...bob, eapr: true}).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertFails(doc.update({ 
        exported: false,
        committed: true,
        commitTime: serverTimestamp(),
        commitUid: "bob",
        commitName: "Bob Example",
      }));
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, managerUid: "alice" });
      });      
      await assertSucceeds(doc.update({ 
        exported: false,
        committed: true,
        commitTime: serverTimestamp(),
        commitUid: "bob",
        commitName: "Bob Example",
      }));

    });
    it("prevents manager (eapr) from rejecting unapproved expenses", async () => {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: false, managerUid: "alice" });
      });      
      const db = testEnvironment.authenticatedContext("bob", { ...bob, eapr: true}).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertFails(doc.update({
        approved: false,
        submitted: false,
        rejected: true,
        rejectorId: "bob",
        rejectorName: "Bob Example", 
        rejectionReason: "no reason given",
      }));
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, managerUid: "alice" });
      });      
      await assertSucceeds(doc.update({
        approved: false,
        submitted: false,
        rejected: true,
        rejectorId: "bob",
        rejectorName: "Bob Example",
        rejectionReason: "no reason given",
      }));
    });
    it("prevents manager (eapr) from committing approved expenses with date in the future", async () => {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ date: addDays(new Date(), 1) , submitted: true, approved: true, managerUid: "alice" });
      });      
      const db = testEnvironment.authenticatedContext("bob", { ...bob, eapr: true}).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await assertFails(doc.update({ 
        exported: false,
        committed: true,
        commitTime: serverTimestamp(),
        commitUid: "bob",
        commitName: "Bob Example",
      }));
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ date: subDays(new Date(), 1) , submitted: true, approved: true, managerUid: "alice" });
      });      
      await assertSucceeds(doc.update({ 
        exported: false,
        committed: true,
        commitTime: serverTimestamp(),
        commitUid: "bob",
        commitName: "Bob Example",
      }));
    });
  });
});