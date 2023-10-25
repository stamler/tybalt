// invoices.ts
// support creating and replacing invoices attached to jobs

import * as functions from "firebase-functions";
import { getAuthObject, isInvoiceObject } from "./utilities";
import * as admin from "firebase-admin";

// This is a callable function that will be called from the client to create an
// invoice. It receives an object containing invoice number, a date, and one or
// more division/amount pairs. Invoices may also have additional properties
// where the following types are allowed: subcontractor, expense. Both of these
// options have a description and an amount field. On the entry page, a running
// total is displayed at the bottom. The uid is read from the auth information
// and the timestamp is generated on the server. A new document is created in
// the Invoices collection with the uid, date, and the rest of the properties
// submitted.
export const createInvoice = functions.https.onCall(async (data: unknown, context: functions.https.CallableContext) => {
  const auth = getAuthObject(context, ["time"]);
  const db = admin.firestore();

  // validate the data object using the appropriate type guard
  if (!isInvoiceObject(data)) {
    throw new functions.https.HttpsError("invalid-argument", "The function must be called with " +
      "an object containing invoice number, date, and one or more division/amount pairs.");
  }

  // verify that the job exists by loading the job from the jobs collection
  const job = await db.collection("Jobs").doc(data.job).get();
  if (!job.exists) {
    throw new functions.https.HttpsError("invalid-argument", "The job does not exist.");
  }

  // verify that the user is the manager or alternate manager on the job by
  // loading the job from the jobs collection and checking the managerUid and
  // alternateManagerUid fields. If this is not the case, check if the user has
  // the job claim with getAuthObject. If not, throw an error.
  if (job.get("managerUid") !== auth.uid && job.get("alternateManagerUid") !== auth.uid) {
    try {
      getAuthObject(context, ["job"]);
    } catch (error) {
      throw new functions.https.HttpsError("permission-denied", "You are not the manager or alternate manager on the job and you don't have the job claim.");
    }
  }

  // Get the user's profile from the Profiles collection
  const profile = await db.collection("Profiles").doc(auth.uid).get();

  // create a new invoice object with the uid, date, and properties from the
  // data object. The timestamp is generated on the server. We also include the
  // user's displayName for quick reference in the UI.
  const invoice = {
    // copy existing properties from the data object
    ...data,
    // add new properties, overwriting any existing properties with the same
    // name
    creatorUid: auth.uid,
    creatorName: profile.get("displayName"),
    createdDate: admin.firestore.FieldValue.serverTimestamp(),
    // convert the number in the date property of the data object to a Date
    // object and overwrite the date property in the invoice object
    date: new Date(data.date),
    // set replaced to false. If the invoice is ever replaced by a revision,
    // this will be set to true and the invoice will be hidden from the UI
    replaced: false,
    // set exported to false. When the invoice is exported, this will be set to
    // true. If the invoice is ever replaced by a revision, this will be set to
    // false when it is deleted from the MySQL database during the next export.
    exported: false,
  };

  // Load all existing invoices with the same number property that have a
  // replaced value of false. If there are any, we need to ensure that they
  // don't have a revisionNumber that matches the one in the data object then
  // throw an error if they do. If there are no existing invoices with the same
  // number, we need to throw an error. Finally, we need to set the replaced
  // property of all existing invoices with the same number to true then create
  // the new invoice within a transaction.

  const newInvoiceRef = db.collection("Invoices").doc();
  await db.runTransaction(async (transaction) => {
    const existingInvoices = db
    .collection("Invoices")
    .where("number", "==", invoice.number)
    .where("replaced", "==", false);

    return transaction.get(existingInvoices).then((existingInvoicesQuerySnap) => {
      // if there are no existing invoices, throw an error if the revisionNumber isn't 0
      if (existingInvoicesQuerySnap.docs.length === 0 && invoice.revisionNumber > 0) {
        throw new functions.https.HttpsError("invalid-argument", "A revision cannot be created for an invoice that does not already exist.");
      }

      // if the revisionNumber is greater than 9, throw an error
      if (invoice.revisionNumber > 9) {
        throw new functions.https.HttpsError("invalid-argument", "A revision number cannot be greater than 9.");
      }
      
      // if there are existing invoices, check that none of them have the same
      // revisionNumber as the one in the data object. If they do, throw an
      // error. Also check that none of them have a revisionNumber that is
      // greater than the one in the data object. If they do, throw an error.

      // NB: This functionality has been significantly changed to allow multiple
      // versions of the same revision to be created. The commented code below
      // is the original functionality.
      existingInvoicesQuerySnap.forEach((existingInvoice) => {
        if (existingInvoice.get("revisionNumber") === invoice.revisionNumber) {
          if (invoice.revisionNumber === 0) {
            throw new functions.https.HttpsError("invalid-argument", `Invoice ${data.number} already exists. If you're creating a revision, set the revisionNumber property to a value greater than 0.`);
          }
          // commented to change behavior to allow multiple versions of the same revision to be created
          // throw new functions.https.HttpsError("invalid-argument", `A revision with number ${data.revisionNumber} already exists for invoice ${data.number}.`);
        }
        // commented to change behavior to allow multiple versions of the same revision to be created
        // if (existingInvoice.get("revisionNumber") > invoice.revisionNumber) {
        //   throw new functions.https.HttpsError("invalid-argument", `Revision ${data.revisionNumber} was already superseded by revision ${existingInvoice.get('revisionNumber')} for invoice ${data.number}.`);
        // }
      });
      // if there are existing invoices and none of them have the same
      // revisionNumber as the one in the data object, set the replaced
      // property of all existing invoices to true

      // NB: This functionality has been significantly changed to allow multiple
      // versions of the same revision to be created. We may now arrive at this
      // point with existing Invoices whose revisionNumber matches the one in
      // the data object. The prior comment reflect the original functionality.

      // Now, the replaced property of all existing invoices with the same
      // number is set to true. The new invoice is then created in the
      // transaction. The most recently created invoice will be the one that
      // has the replaced property set to false. This is the invoice that will
      // be displayed in the UI and that will be synced to the MySQL database
      // during the next export and used for reporting.
      existingInvoicesQuerySnap.forEach((existingInvoice) => {
        transaction.update(existingInvoice.ref, { replaced: true });
      });
      return transaction.set(newInvoiceRef, invoice);
    });
  });
  return newInvoiceRef;
});
