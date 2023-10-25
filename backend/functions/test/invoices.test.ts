import * as test from "firebase-functions-test";
import * as chai from "chai";    
import * as chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);
import { admin } from "./index.test";

import "mocha";

const assert = chai.assert;

import { createInvoice } from '../src/invoices';

const db = admin.firestore()
const tester = test();
const wrapped = tester.wrap(createInvoice);
const validInvoice = {
  job: "24-001",
  number: "2401001",
  revisionNumber: 0,
  billingNumber: 1,
  date: (new Date("2020-01-01")).getTime(),
  lineItems: [
    { lineType: "division", description: "div1", amount: 100 },
  ],
  replaced: false,
};
const timeClaimContext = {
  auth: { uid: "user1", token: { time: true } },
};

describe('createInvoice', () => {
  before(async () => {
    // Create test data
    await db.collection("Jobs").doc("24-001").set({ managerUid: "user1", alternateManagerUid: "user2", description: "A basic job", client: "A special client" });
    await db.collection("Profiles").doc("user1").set({displayName: "User One"});
    await db.collection("Profiles").doc("user2").set({displayName: "User Two"});
    await db.collection("Profiles").doc("user3").set({displayName: "User Three"});
  });

  beforeEach(async () => {
    // Clear the database between tests
    const invoices = await db.collection("Invoices").get();
    invoices.forEach(async invoice => await invoice.ref.delete());
  });

  it('allows manager of a job to create a new invoice', async () => {
    const result = wrapped(validInvoice, timeClaimContext);
    assert.isFulfilled(result);
    // get the new invoice document
    const response = await result;
    const invoice = await db.collection("Invoices").doc(response.id).get();
    assert.equal(invoice.get("job"), "24-001");
    assert.equal(invoice.get("creatorUid"), "user1");
  });
  it('allows alternate manager of a job to create a new invoice', async () => {
    const result = wrapped(validInvoice, { ...timeClaimContext, auth: { uid: "user2", token: { time: true } } });
    assert.isFulfilled(result);
    // get the new invoice document
    const response = await result;
    const invoice = await db.collection("Invoices").doc(response.id).get();
    assert.equal(invoice.get("job"), "24-001");
    assert.equal(invoice.get("creatorUid"), "user2");
  });
  it('does not allow non-managers to create a new invoice unless they have the job claim', async () => {
    let result = wrapped(validInvoice, { ...timeClaimContext, auth: { uid: "user3", token: { time: true } } });
    await assert.isRejected(result);
    result = wrapped(validInvoice, { ...timeClaimContext, auth: { uid: "user3", token: { time: true, job: true } } });
    await assert.isFulfilled(result);
  });
  it('requires invoices to be valid', async () => {
    const invalidInvoice = { ...validInvoice, lineItems: [] };
    const result = wrapped(invalidInvoice, timeClaimContext);
    await assert.isRejected(result, "The function must be called with an object containing invoice number, date, and one or more division/amount pairs.");
  });
  it('requires jobs to exist', async () => {
    const invalidInvoice = { ...validInvoice, job: "24-002" };
    const result = wrapped(invalidInvoice, timeClaimContext);
    await assert.isRejected(result, "The job does not exist.");
  });

  it('requires billingNumber to an integer greater than 0', async () => {
    // fails when < 1
    const invalidInvoice = { ...validInvoice, billingNumber: 0 };
    const result = wrapped(invalidInvoice, timeClaimContext);
    await assert.isRejected(result);

    // fails when not integer
    const invalidInvoice2 = { ...validInvoice, billingNumber: 1.1 };
    const result2 = wrapped(invalidInvoice2, timeClaimContext);
    await assert.isRejected(result2);
  });

  it('requires revisionNumber to a positive integer from 0 to 9', async () => {
    // create a valid invoice
    await db.collection("Invoices").add(validInvoice);

    // fails when > 9
    const invalidInvoice3 = { ...validInvoice, revisionNumber: 10 };
    const result3 = wrapped(invalidInvoice3, timeClaimContext);
    await assert.isRejected(result3);

    // fails when < 0
    const invalidInvoice = { ...validInvoice, revisionNumber: -1 };
    const result = wrapped(invalidInvoice, timeClaimContext);
    await assert.isRejected(result);

    // fails when not integer
    const invalidInvoice2 = { ...validInvoice, revisionNumber: 1.1 };
    const result2 = wrapped(invalidInvoice2, timeClaimContext);
    await assert.isRejected(result2);
  });

  it('requires the number property to follow the correct format', async () => {
    // fails when the second two digits are not between 01 and 12
    const invalidInvoice = { ...validInvoice, number: "2414001" };
    const result = wrapped(invalidInvoice, timeClaimContext);
    await assert.isRejected(result);

    // fails when there are more than 8 digits
    const invalidInvoice2 = { ...validInvoice, number: "240100100" };
    const result2 = wrapped(invalidInvoice2, timeClaimContext);
    await assert.isRejected(result2);

    // fails when any of the characters are not digits
    const invalidInvoice3 = { ...validInvoice, number: "2401a01" };
    const result3 = wrapped(invalidInvoice3, timeClaimContext);
    await assert.isRejected(result3);
  });

  it('rejects invoice revisions if there is no existing invoice with the same number', async () => {
    const revision1 = { ...validInvoice, revisionNumber: 1 };
    const result = wrapped(revision1, timeClaimContext);
    await assert.isRejected(result, "A revision cannot be created for an invoice that does not already exist.");

    // now create the original invoice then run the test again
    await db.collection("Invoices").add(validInvoice);
    const result2 = wrapped(revision1, timeClaimContext);
    await assert.isFulfilled(result2);
  });

  it('rejects an invoice with revision number 0 if there is an existing invoice with the same number', async () => {
    await db.collection("Invoices").add(validInvoice);
    const result = wrapped(validInvoice, timeClaimContext);
    await assert.isRejected(result, "Invoice 2401001 already exists. If you're creating a revision, set the revisionNumber property to a value greater than 0");
  });

  it('allows invoice revisions even if there is an existing invoice with the same number and revisionNumber', async () => {
    const revision1 = { ...validInvoice, revisionNumber: 1 };
    const revision2 = { ...validInvoice, revisionNumber: 2 };
    await db.collection("Invoices").add(validInvoice);
    await db.collection("Invoices").add(revision1);
    const result = wrapped(revision1, timeClaimContext);
    await assert.isFulfilled(result);
    await assert.isFulfilled(wrapped(revision2, timeClaimContext));
  });

  it('allows invoice revisions if there is an existing invoice with the same number and a higher revisionNumber', async () => {
    const revision1 = { ...validInvoice, revisionNumber: 1 };
    const revision2 = { ...validInvoice, revisionNumber: 2 };
    await db.collection("Invoices").add(validInvoice);
    await db.collection("Invoices").add(revision2);
    const result = wrapped(revision1, timeClaimContext);
    await assert.isFulfilled(result);
  });
  it('marks previous invoice versions as replaced when a new revision is created', async () => {
    const revision1 = { ...validInvoice, revisionNumber: 1 };
    await db.collection("Invoices").add(validInvoice);

    // confirm the original invoice is not marked as replaced
    const originalInvoice = await db.collection("Invoices").get();
    assert.equal(originalInvoice.docs.length, 1);
    assert.equal(originalInvoice.docs[0].get("replaced"), false);

    // create the first revision
    await wrapped(revision1, timeClaimContext);

    // confirm the original invoice is marked as replaced
    const invoices = await db.collection("Invoices").get();
    assert.equal(invoices.docs.length, 2);

    // get the invoice with revisionNumber 0
    const originalInvoice2 = invoices.docs.find(invoice => invoice.get("revisionNumber") === 0);
    assert.equal(originalInvoice2?.get("replaced"), true);
  });
  // TODO: add tests for other validation rules
});
