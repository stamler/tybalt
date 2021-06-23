import * as firebase from "@firebase/rules-unit-testing";
import "mocha";
import { addDays, subDays } from "date-fns";

const projectId = "test-app-id";

const alice = { displayName: "Alice Example", timeSheetExpected: false, email: "alice@example.com", personalVehicleInsuranceExpiry: addDays(new Date(), 7), salary: false, tbtePayrollId: 28 };
const bob = { displayName: "Bob Example", email: "bob@example.com", timeSheetExpected: true };
const adminDb = firebase.initializeAdminApp({ projectId }).firestore();
const timeDb = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, time: true } }).firestore();
const profiles = adminDb.collection("Profiles");

describe("Firestore Rules (Expenses)", function () {
  this.timeout(3000);
  describe("Expenses", () => {
    const expenses = adminDb.collection("Expenses");
    const divisions = adminDb.collection("Divisions");
    const jobs = adminDb.collection("Jobs");
    const baseline = { uid: "alice", displayName: "Alice Example", surname: "Example", givenName: "Alice", date: new Date(), total: 50, description: "Monthly recurring expense", submitted: false, approved: false, managerUid: "bob", managerName: "Bob Example", division: "ABC", divisionName: "Playtime", paymentType: "Expense", vendorName: "Super vendor", attachment: "foo", tbtePayrollId: 28 };
    const expenseJobProperties = { job: "19-333", jobDescription: "Big job for a client", client: "A special client" };
    const division = { name: "Playtime" };

    beforeEach("reset data", async () => {
      await firebase.clearFirestoreData({ projectId });
      await jobs.doc("19-333").set({ description: "Big job for a client", client: "A special client" });
      await expenses.doc("F3312A64Lein7bRiC5HG").set(baseline);
      await divisions.doc("ABC").set(division);
      await profiles.doc("alice").set(alice);
      await profiles.doc("bob").set(bob);
    });

    it("allows owner to read their own Expenses if they have time claim", async () => {
      const doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.get())
    });
    it("allows owner to create expenses", async () => {
      const doc = timeDb.collection("Expenses").doc("newExpense");
      await firebase.assertSucceeds(
        doc.set(baseline)
      );
    });
    it("prevents owner from creating expense that's already approved or committed", async () => {
      const doc = timeDb.collection("Expenses").doc("newExpense");
      const {approved, ...noApproved} = baseline;
      await firebase.assertFails(
        doc.set({...noApproved, approved: true})
      );
      await firebase.assertFails(
        doc.set({...noApproved, approved: true, committed: true})
      );
      await firebase.assertFails(
        doc.set({...noApproved, committed: true})
      );
    });
    it("allows owner to submit expenses", async () => {
      const doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(
        doc.set({ submitted: true }, { merge: true })
      );
    });
    it("prevents owner from approving or committing their own expenses", async () => {
      const doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ submitted: true, approved: true }, { merge: true })
      );
      await firebase.assertFails(
        doc.set({ submitted: true, committed: true }, { merge: true })
      );
      await firebase.assertFails(
        doc.set({ submitted: true, approved: true, committed: true }, { merge: true })
      );
    });
    it("allows owner to submit and approve expenses simultaneously if they have tapr claim and are their own manager", async () => {
      const { managerUid, managerName, ...noManager } = baseline;
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").set({ managerUid: "alice", managerName: "Alice Example", ...noManager});
      let doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ submitted: true, approved: true, committed: false }, { merge: true })
      );
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice, tapr: true } }).firestore();
      doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ submitted: true, approved: true, committed: true }, { merge: true })
      );
      await firebase.assertSucceeds(
        doc.set({ submitted: true, approved: true, committed: false }, { merge: true })
      );
    });
    it("prevents rejected expenses from being submitted", async () => {
      const doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ rejected: true });
      await firebase.assertFails(
        doc.set({ submitted: true }, { merge: true })
      );
    });
    it("allows owner to delete their own Expenses if they have time claim", async () => {
      const doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.delete())
    });
    it("allows owner to recall unapproved Expenses and prevents recall of approved ones", async () => {
      // unapproved
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true });
      const doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.update({ submitted: false }));
      // approved
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true });
      await firebase.assertFails(doc.update({ submitted: false }));
    });

    it("allows manager (tapr) to read submitted Expenses they manage", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, tapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.get());
    });
    it("prevents manager (tapr) from approving Expenses they do not manage", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true });
      let db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, tapr: true } }).firestore();
      let doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(
        doc.set({ approved: true, committed: false }, { merge: true })
      );
      db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...bob, tapr: true } }).firestore();
      doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ approved: true, committed: false }, { merge: true })
      );
    });
    it("prevents manager (tapr) from approving unsubmitted Expenses", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, tapr: true } }).firestore();
      let doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ approved: true, committed: false }, { merge: true })
      );
    });

    it("allows manager (eapr) to read any approved Expenses", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, managerUid: "alice" });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, eapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.get());
    });
    it("allows report claim holder to read any committed Expenses", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, managerUid: "alice", committed: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, report: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.get());
    });
    it("prevents report claim holder from reading any unsubmitted Expenses", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: false, approved: false, managerUid: "alice", committed: false });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, report: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.get());
    });
    it("allows report claim holder to read any submitted Expenses", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: false, managerUid: "alice", committed: false });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, report: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.get());
    });
    it("allows expense rejector (erej) to read any approved Expenses", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, managerUid: "alice" });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, erej: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.get());
    });
    it("allows expense rejector (erej) to reject any approved Expense, but not unapproved", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...alice, erej: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: false, approved: false, committed: false });
      await firebase.assertFails(
        doc.set({ rejected: true, rejectorId: "bob", rejectorName: "Bob Example", rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: false, committed: false });
      await firebase.assertFails(
        doc.set({ rejected: true, rejectorId: "bob", rejectorName: "Bob Example",  rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, committed: false });
      await firebase.assertSucceeds(
        doc.set({ rejected: true, rejectorId: "bob", rejectorName: "Bob Example", rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
    });
    it("prevents owner from deleting their own Expenses if they are submitted", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true });
      const doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.delete())
    });
    it("prevents owner from deleting their own Expenses if they are approved", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true });
      const doc = timeDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.delete())
    });
    it("prevents manager from deleting Expenses they manage", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, tapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.delete())
    });
    it("prevents owner from reading their own Expenses if they have no time claim", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...alice } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.get())
    });
    it("prevents manager (tapr) from reading submitted Expenses they do not manage", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, managerUid: "alice" });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, tapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.get());
    });
    it("prevents user with managerUid from reading submitted Expenses if they are missing tapr claim", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.get());
    });
    it("prevents manager (tapr) from reading unsubmitted Expenses they manage", async () => {
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, tapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.get());
    });
    it("prevents manager (eapr) from reading unapproved Expenses", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, managerUid: "alice" });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, eapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.get());
    });
    it("requires submitted uid to match the authenticated user id", async () => {
      const doc = timeDb.collection("Expenses").doc();
      await firebase.assertSucceeds(doc.set(baseline));
      const { uid, ...missingUid } = baseline;
      await firebase.assertFails(doc.set({ uid: "bob", ...missingUid }));
    });
    it("requires documents not have unspecified fields", async () => {
      const doc = timeDb.collection("Expenses").doc();
      await firebase.assertSucceeds(doc.set(baseline));
      await firebase.assertFails(doc.set({ ...baseline, foo: "bar" }));
    });
    it("rejects Mileage Expenses where the user doesn't have valid personal car insurance on their profile", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const {vendorName, paymentType, attachment, total,...missingPaymentTypeAndAttachmentAndTotal } = baseline;
      await firebase.assertSucceeds(doc.set({ paymentType: "Mileage", distance: 5, ...missingPaymentTypeAndAttachmentAndTotal }));
      const { personalVehicleInsuranceExpiry, ...missingPersonalVehicleInsuranceExpiry } = alice;
      await profiles.doc("alice").set({personalVehicleInsuranceExpiry: subDays(new Date(), 7), ...missingPersonalVehicleInsuranceExpiry});
      await firebase.assertFails(doc.set({ paymentType: "Mileage", distance: 5, ...missingPaymentTypeAndAttachmentAndTotal }));
    });
    it("requires any referenced job to be valid", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { job, ...missingJob } = expenseJobProperties;
      await firebase.assertSucceeds(doc.set({ ...baseline, ...missingJob, job:"19-333", description: "Big job for a client", client: "A special client" }));
      await firebase.assertFails(doc.set({ ...baseline, ...missingJob, job:"20-333", description: "Big job for a client", client: "A special client" }));
    });
    it("requires division to be present and valid", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { division, ...missingDivision } = baseline;
      await firebase.assertFails(doc.set(missingDivision));
      await firebase.assertFails(doc.set({ division: "DEF", ...missingDivision }));
      await firebase.assertSucceeds(doc.set({ division: "ABC", ...missingDivision }));
    });
    it("requires total to be positive number if paymentType is not Mileage", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, total, ...missingPaymentTypeAndTotal } = baseline;
      await firebase.assertFails(doc.set({paymentType: "Expense",...missingPaymentTypeAndTotal}));
      await firebase.assertFails(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", ...missingPaymentTypeAndTotal}));
      await firebase.assertFails(doc.set({paymentType: "CorporateCreditCard", ccLast4digits: "1234",...missingPaymentTypeAndTotal}));
      await firebase.assertFails(doc.set({paymentType: "Expense", total: -50.5, ...missingPaymentTypeAndTotal}));
      await firebase.assertSucceeds(doc.set({paymentType: "Expense", total: 50.5, ...missingPaymentTypeAndTotal}));
      await firebase.assertSucceeds(doc.set({paymentType: "CorporateCreditCard", ccLast4digits: "1234", total: 50.5, ...missingPaymentTypeAndTotal}));
      await firebase.assertSucceeds(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", total: 50.5, ...missingPaymentTypeAndTotal}));
    });
    it("requires vendor if paymentType is CorporateCreditCard, FuelCard, Expense, or FuelOnAccount", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, vendorName, ...missingPaymentTypeAndVendor } = baseline;
      const { description, ...missingDescriptionToo } = missingPaymentTypeAndVendor;
      await firebase.assertFails(doc.set({paymentType: "Expense", ...missingPaymentTypeAndVendor}));
      await firebase.assertSucceeds(doc.set({paymentType: "Expense", vendorName: "foo", ...missingPaymentTypeAndVendor}));
      await firebase.assertFails(doc.set({paymentType: "CorporateCreditCard", ccLast4digits: "1234", ...missingPaymentTypeAndVendor}));
      await firebase.assertSucceeds(doc.set({paymentType: "CorporateCreditCard", ccLast4digits: "1234", vendorName: "foo", ...missingPaymentTypeAndVendor}));
      await firebase.assertFails(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", ...missingPaymentTypeAndVendor}));
      await firebase.assertSucceeds(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", vendorName: "foo", ...missingPaymentTypeAndVendor}));
      await firebase.assertFails(doc.set({paymentType: "FuelOnAccount", unitNumber: 10, ...missingDescriptionToo}));
      await firebase.assertSucceeds(doc.set({paymentType: "FuelOnAccount", unitNumber: 10, vendorName: "foo", ...missingDescriptionToo}));
    });
    it("requires attachment if paymentType is CorporateCreditCard, FuelCard or Expense, but FuelOnAccount does not require attachment", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, attachment, ...missingPaymentTypeAndAttachment } = baseline;
      const { description, ...missingDescriptionToo } = missingPaymentTypeAndAttachment;
      await firebase.assertFails(doc.set({paymentType: "Expense", ...missingPaymentTypeAndAttachment}));
      await firebase.assertSucceeds(doc.set({paymentType: "Expense", attachment: "foo", ...missingPaymentTypeAndAttachment}));
      await firebase.assertSucceeds(doc.set({paymentType: "FuelOnAccount", unitNumber: 25, ...missingDescriptionToo}));
      await firebase.assertFails(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", ...missingPaymentTypeAndAttachment}));
      await firebase.assertFails(doc.set({paymentType: "CorporateCreditCard", ccLast4digits: "1234", ...missingPaymentTypeAndAttachment}));
      await firebase.assertSucceeds(doc.set({paymentType: "FuelOnAccount", unitNumber: 25, attachment: "foo", ...missingDescriptionToo}));
      await firebase.assertSucceeds(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", attachment: "foo", ...missingPaymentTypeAndAttachment}));
      await firebase.assertSucceeds(doc.set({paymentType: "CorporateCreditCard", ccLast4digits: "1234", attachment: "foo", ...missingPaymentTypeAndAttachment}));
    });
    it("requires ccLast4digits be 4 character number-only string if paymentType is either CorporateCreditCard or FuelCard", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, ...missingPaymentType } = baseline;
      await firebase.assertFails(doc.set({paymentType: "FuelCard", ...missingPaymentType }));
      await firebase.assertFails(doc.set({paymentType: "CorporateCreditCard", ...missingPaymentType }));
      await firebase.assertSucceeds(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", ...missingPaymentType }));
      await firebase.assertSucceeds(doc.set({paymentType: "CorporateCreditCard", ccLast4digits: "5678", ...missingPaymentType }));
    });
    it("requires ccLast4digits be missing if paymentType is not CorporateCreditCard or FuelCard", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, ...missingPaymentType } = baseline;
      await firebase.assertFails(doc.set({paymentType: "Expense", ccLast4digits: "1234", ...missingPaymentType }));
      await firebase.assertSucceeds(doc.set({paymentType: "Expense", ...missingPaymentType }));
    });
    it("requires po to be missing if paymentType FuelCard or FuelOnAccount", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, ...missingPaymentType } = baseline;
      const { description, ...missingDescriptionToo } = missingPaymentType
      await firebase.assertFails(doc.set({paymentType: "FuelCard", po: "5126", ccLast4digits: "1234", ...missingPaymentType }));
      await firebase.assertSucceeds(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", ...missingPaymentType }));
      await firebase.assertFails(doc.set({paymentType: "FuelOnAccount", po: "5126", unitNumber: 25, ...missingDescriptionToo }));
      await firebase.assertSucceeds(doc.set({paymentType: "FuelOnAccount", unitNumber: 25, ...missingDescriptionToo }));
    });
    it("requires unitNumber to be missing if paymentType not FuelOnAccount", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, ...missingPaymentType } = baseline;
      await firebase.assertFails(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", unitNumber: 25, ...missingPaymentType }));
      await firebase.assertSucceeds(doc.set({paymentType: "FuelCard", ccLast4digits: "1234", ...missingPaymentType }));
    });
    it("requires unitNumber to be positive integer if paymentType is FuelOnAccount", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, description, ...missingPaymentTypeAndDescription } = baseline;
      await firebase.assertFails(doc.set({paymentType: "FuelOnAccount", ...missingPaymentTypeAndDescription }));
      await firebase.assertFails(doc.set({paymentType: "FuelOnAccount", unitNumber: -25, ...missingPaymentTypeAndDescription }));
      await firebase.assertFails(doc.set({paymentType: "FuelOnAccount", unitNumber: 0.5, ...missingPaymentTypeAndDescription }));
      await firebase.assertFails(doc.set({paymentType: "FuelOnAccount", unitNumber: 0, ...missingPaymentTypeAndDescription }));
      await firebase.assertSucceeds(doc.set({paymentType: "FuelOnAccount", unitNumber: 25, ...missingPaymentTypeAndDescription }));
    });
    it("requires paymentType to be one of CorporateCreditCard, Expense, Mileage, FuelCard, FuelOnAccount, Allowance, PersonalReimbursement", async () => {
      await profiles.doc("alice").update({allowPersonalReimbursement: true});
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, vendorName, ...missingPaymentType } = baseline;
      const { total, ...missingPaymentTypeAndTotal } = missingPaymentType;
      const { attachment, ...missingPaymentTypeAndTotalAndAttachment } = missingPaymentTypeAndTotal;
      const { description, ...missingPaymentTypeAndTotalAndAttachmentAndDescription } = missingPaymentTypeAndTotalAndAttachment;
      await firebase.assertFails(doc.set(missingPaymentType));
      await firebase.assertFails(doc.set({ paymentType: "DEF", ...missingPaymentType }));
      await firebase.assertSucceeds(doc.set({ paymentType: "Mileage", distance: 5, ...missingPaymentTypeAndTotalAndAttachment }));
      await firebase.assertSucceeds(doc.set({ paymentType: "CorporateCreditCard", vendorName: "foo", ccLast4digits: "1234", ...missingPaymentType }));
      await firebase.assertSucceeds(doc.set({ paymentType: "FuelCard", vendorName: "foo", ccLast4digits: "1234", ...missingPaymentType }));
      await firebase.assertSucceeds(doc.set({ paymentType: "FuelOnAccount", total:50, vendorName: "foo", unitNumber: 1234, ...missingPaymentTypeAndTotalAndAttachmentAndDescription }));
      await firebase.assertSucceeds(doc.set({ paymentType: "Expense", vendorName: "foo", ...missingPaymentType }));
      await firebase.assertSucceeds(doc.set({ paymentType: "Allowance", breakfast: true, lunch: true, dinner:true, lodging:false, ...missingPaymentTypeAndTotalAndAttachmentAndDescription }));
      await firebase.assertSucceeds(doc.set({ paymentType: "PersonalReimbursement", total: 100, ...missingPaymentTypeAndTotalAndAttachment}));
    });
    it("requires PersonalReimbursement expenses to have only total and description with optional job", async () => {
      await profiles.doc("alice").update({allowPersonalReimbursement: true});
      const doc = timeDb.collection("Expenses").doc();
      const {vendorName, paymentType, attachment, ...prbase } = baseline;
      await firebase.assertSucceeds(doc.set({paymentType: "PersonalReimbursement",...prbase}));
      await firebase.assertSucceeds(doc.set({paymentType: "PersonalReimbursement",...prbase, job:"19-333", jobDescription: "Big job for a client", client: "A special client" }));
      await firebase.assertFails(doc.set({paymentType: "PersonalReimbursement",...prbase, job:"19-333", client: "A special client" }));
      await firebase.assertFails(doc.set({paymentType: "PersonalReimbursement", breakfast: true,...prbase}));
      await firebase.assertFails(doc.set({paymentType: "PersonalReimbursement", vendorName: "Some vendor",...prbase}));
      await firebase.assertFails(doc.set({paymentType: "PersonalReimbursement", ccLast4digits: "1234",...prbase}));
      await firebase.assertFails(doc.set({paymentType: "PersonalReimbursement", unitNumber: 12,...prbase}));
      await firebase.assertFails(doc.set({paymentType: "PersonalReimbursement", attachment: "asdf",...prbase}));
      await firebase.assertFails(doc.set({paymentType: "PersonalReimbursement", distance: 5,...prbase}));
      await firebase.assertFails(doc.set({paymentType: "PersonalReimbursement", po: "235",...prbase}));
    });
    it("requires PersonalReimbursement expenses to have proper flag on profile", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const {vendorName, paymentType, attachment, ...prbase } = baseline;
      await firebase.assertFails(doc.set({paymentType: "PersonalReimbursement",...prbase}));
      await profiles.doc("alice").update({allowPersonalReimbursement: true});
      await firebase.assertSucceeds(doc.set({paymentType: "PersonalReimbursement",...prbase}));
    });
    it("requires Allowance expenses to have boolean breakfast, lunch, dinner, and lodging properties", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const skeleton = { uid: "alice", displayName: "Alice Example", surname: "Example", givenName: "Alice", date: new Date(), submitted: false, approved: false, managerUid: "bob", managerName: "Bob Example", division: "ABC", divisionName: "Playtime", paymentType: "Allowance", tbtePayrollId: 28 };
      await firebase.assertFails(doc.set(skeleton));
      await firebase.assertFails(doc.set({breakfast: true, ...skeleton}));
      await firebase.assertFails(doc.set({breakfast: "true", lunch: 56, dinner:false, lodging: false, ...skeleton}));
      await firebase.assertSucceeds(doc.set({breakfast: true, lunch: true, dinner:false, lodging: false, ...skeleton}));
    });
    it("requires Allowance expenses to not have description or total properties", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const skeleton = { uid: "alice", displayName: "Alice Example", surname: "Example", givenName: "Alice", date: new Date(), submitted: false, approved: false, managerUid: "bob", managerName: "Bob Example", division: "ABC", divisionName: "Playtime", paymentType: "Allowance", tbtePayrollId: 28 };
      await firebase.assertFails(doc.set({ description: "Meals", breakfast: true, lunch: true, dinner:false, lodging: false, ...skeleton}));
      await firebase.assertFails(doc.set({ total: 50, breakfast: true, lunch: true, dinner:false, lodging: true, ...skeleton}));
      await firebase.assertSucceeds(doc.set({breakfast: true, lunch: true, dinner:false, lodging: true, ...skeleton}));
    });
    it("requires FuelOnAccount expenses to not have description", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, description, ...missing } = baseline;
      await firebase.assertFails(doc.set({ paymentType: "FuelOnAccount", unitNumber:10, description: "4chars", ...missing}));
      await firebase.assertSucceeds(doc.set({ paymentType: "FuelOnAccount", unitNumber:10, ...missing}));
    });
    it("allows Allowance entries to have an associated job that exists", async() => {
      const doc = timeDb.collection("Expenses").doc();
      const skeleton = { uid: "alice", displayName: "Alice Example", surname: "Example", givenName: "Alice", date: new Date(), submitted: false, approved: false, managerUid: "bob", managerName: "Bob Example", division: "ABC", divisionName: "Playtime", paymentType: "Allowance", tbtePayrollId: 28 };
      await firebase.assertFails(doc.set({breakfast: true, lunch: true, dinner:true, lodging: true, job:"19-332", jobDescription: "Big job for a client", client: "A special client", ...skeleton}));      
      await firebase.assertSucceeds(doc.set({breakfast: true, lunch: true, dinner:true, lodging: true, job:"19-333", jobDescription: "Big job for a client", client: "A special client", ...skeleton}));      
    });
    it("requires distance to be integer > 0 if paymentType is Mileage", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { vendorName, paymentType, total, attachment, ...missingPaymentTypeAndTotalAndAttachment } = baseline;
      await firebase.assertSucceeds(doc.set({ paymentType: "Mileage", distance: 5, ...missingPaymentTypeAndTotalAndAttachment }));
      await firebase.assertFails(doc.set({ paymentType: "Mileage", distance: -1, ...missingPaymentTypeAndTotalAndAttachment }));
      await firebase.assertFails(doc.set({ paymentType: "Mileage", distance: 0.5, ...missingPaymentTypeAndTotalAndAttachment }));
      await firebase.assertFails(doc.set({ paymentType: "Mileage", distance: "foo", ...missingPaymentTypeAndTotalAndAttachment }));
      await firebase.assertFails(doc.set({ paymentType: "Mileage", ...missingPaymentTypeAndTotalAndAttachment }));
    });
    it("requires po, vendorName, attachment, total to be missing if paymentType is Mileage", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { vendorName, paymentType, total, attachment, ...missingPaymentTypeAndTotalAndAttachment } = baseline;
      await firebase.assertSucceeds(doc.set({ paymentType: "Mileage", distance: 5, ...missingPaymentTypeAndTotalAndAttachment }));
      await firebase.assertFails(doc.set({ paymentType: "Mileage", distance: 5, po: "foo", ...missingPaymentTypeAndTotalAndAttachment }));
      await firebase.assertFails(doc.set({ paymentType: "Mileage", distance: 5, vendorName: "foo", ...missingPaymentTypeAndTotalAndAttachment }));
      await firebase.assertFails(doc.set({ paymentType: "Mileage", distance: 5, attachment: "foo", ...missingPaymentTypeAndTotalAndAttachment }));
      await firebase.assertFails(doc.set({ paymentType: "Mileage", distance: 5, total: 55, ...missingPaymentTypeAndTotalAndAttachment }));
    });
    it("requires distance to missing if paymentType is not Mileage", async () => {
      const doc = timeDb.collection("Expenses").doc();
      const { paymentType, ...missingPaymentType } = baseline;
      await firebase.assertSucceeds(doc.set({ paymentType: "Expense", ...missingPaymentType}));
      await firebase.assertFails(doc.set({ paymentType: "Expense", distance: 5, ...missingPaymentType}));
    });
    it("allows documents to have vendorName field", async () => {
      const doc = timeDb.collection("Expenses").doc();
      await firebase.assertSucceeds(doc.set(baseline));
      await firebase.assertSucceeds(doc.set({ ...baseline, vendorName: "Foobar Company" }));
    });
    it("allows manager (tapr) to reject submitted expenses they manage", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: false });
      let db = firebase.initializeTestApp({ projectId, auth: { uid: "alice",...bob, tapr: true } }).firestore();
      let doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ rejected: true, rejectorId: "alice", rejectorName: "Alice Example", rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
      db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, tapr: true } }).firestore();
      doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(
        doc.set({ rejected: true, rejectorId: "bob", rejectorName: "Bob Example",  rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
    });
    it("requires expense rejections to include rejectorId and rejectorName", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: false });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, tapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(
        doc.set({ rejected: true, rejectorId: "bob",  rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
      await firebase.assertFails(
        doc.set({ rejected: true, rejectorName: "Bob Example",  rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
      await firebase.assertSucceeds(
        doc.set({ rejected: true, rejectorId: "bob", rejectorName: "Bob Example",  rejectionReason: "6chars", approved: false, submitted: false }, { merge: true })
      );
    });
    it("allows manager (eapr) to commit approved expenses", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, managerUid: "alice" });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, eapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertSucceeds(doc.update({ 
        committed: true,
        commitTime: firebase.firestore.FieldValue.serverTimestamp(),
        commitUid: "bob",
        commitName: "Bob Example",
      }));
    });
    it("prevents manager (eapr) from committing approved expenses if writing a UID other than their own", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, managerUid: "alice" });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, eapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.update({ 
        committed: true,
        commitTime: firebase.firestore.FieldValue.serverTimestamp(),
        commitUid: "alice",
        commitName: "Bob Example",
      }));
      await firebase.assertSucceeds(doc.update({ 
        committed: true,
        commitTime: firebase.firestore.FieldValue.serverTimestamp(),
        commitUid: "bob",
        commitName: "Bob Example",
      }));
    });
    it("prevents manager (eapr) from committing unapproved expenses", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: false, managerUid: "alice" });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, eapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.update({ 
        committed: true,
        commitTime: firebase.firestore.FieldValue.serverTimestamp(),
        commitUid: "bob",
        commitName: "Bob Example",
      }));
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, managerUid: "alice" });
      await firebase.assertSucceeds(doc.update({ 
        committed: true,
        commitTime: firebase.firestore.FieldValue.serverTimestamp(),
        commitUid: "bob",
        commitName: "Bob Example",
      }));

    });
    it("prevents manager (eapr) from rejecting unapproved expenses", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: false, managerUid: "alice" });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, eapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.update({
        approved: false,
        submitted: false,
        rejected: true,
        rejectorId: "bob",
        rejectorName: "Bob Example", 
        rejectionReason: "no reason given",
      }));
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ submitted: true, approved: true, managerUid: "alice" });
      await firebase.assertSucceeds(doc.update({
        approved: false,
        submitted: false,
        rejected: true,
        rejectorId: "bob",
        rejectorName: "Bob Example",
        rejectionReason: "no reason given",
      }));
    });
    it("prevents manager (eapr) from committing approved expenses with date in the future", async () => {
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ date: addDays(new Date(), 1) , submitted: true, approved: true, managerUid: "alice" });
      const db = firebase.initializeTestApp({ projectId, auth: { uid: "bob",...bob, eapr: true } }).firestore();
      const doc = db.collection("Expenses").doc("F3312A64Lein7bRiC5HG");
      await firebase.assertFails(doc.update({ 
        committed: true,
        commitTime: firebase.firestore.FieldValue.serverTimestamp(),
        commitUid: "bob",
        commitName: "Bob Example",
      }));
      await adminDb.collection("Expenses").doc("F3312A64Lein7bRiC5HG").update({ date: subDays(new Date(), 1) , submitted: true, approved: true, managerUid: "alice" });
      await firebase.assertSucceeds(doc.update({ 
        committed: true,
        commitTime: firebase.firestore.FieldValue.serverTimestamp(),
        commitUid: "bob",
        commitName: "Bob Example",
      }));
    });
  });
});