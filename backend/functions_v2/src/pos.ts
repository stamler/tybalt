// TODO: Use codebase property of firebase.json to separate v2 and v1 code?
// https://github.com/firebase/firebase-functions/issues/1131

// pos.ts
// support creating, deleting, and editing purchase order requests

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { getAuthObject, isPurchaseOrderRequestObject, isDocIdObject } from "./utilities";
import { APP_NATIVE_TZ, MANAGER_PO_LIMIT, VP_PO_LIMIT } from "./config";

const db = admin.firestore();

// This is a callable function that will be called from the client to create a
// PurchaseOrderRequests document. It receives an object containing the data
// entered in the UI. The uid is read from the auth information. A new document
// is created in the PurchaseOrderRequests collection.
export const createPurchaseOrderRequest = onCall(async (callableRequest) => {
  const auth = getAuthObject(callableRequest, ["time"]);  
  const data = callableRequest.data;

  // validate the data object using the appropriate type guard
  if (!isPurchaseOrderRequestObject(data)) {
    throw new HttpsError("invalid-argument", "The function must be called " +
      "with a valid purchase order request object.");
  }

  if (data.job) {
    // A job is specified. Verify that the job exists by attempting to load it
    // from the jobs collection, otherwise throw an error.
    const job = await db.collection("Jobs").doc(data.job).get();
    if (!job.exists) {
      throw new HttpsError("invalid-argument", "The job does not exist.");
    }

    // verify that the managerUid property of the job matches the managerUid
    // property of the PurchaseOrderRequest. If not, throw an error.
    if (job.get("managerUid") !== data.managerUid) {
      throw new HttpsError("permission-denied", "If a job is specified, " +
        "the manager of the request must match the manager of the job.");
    }

    // Verify that the managerDisplayName property of the job matches the
    // managerName property of the PurchaseOrderRequest. If not, throw an error.
    if (job.get("managerDisplayName") !== data.managerName) {
      throw new HttpsError("permission-denied", "If a job is specified, " +
        "the manager name of the request must match the manager name of the job.");
    }

    // verify that the job status is "Active". If not, throw an error.
    if (job.get("status") !== "Active") {
      throw new HttpsError("failed-precondition", "The job must be active.");
    }
    
    logger.debug("Job specified, verifications completed");
  } else {
    // get the manager's profile from the Profiles collection
    const managerProfile = await db.collection("Profiles").doc(data.managerUid).get();

    // verify that the manager has the "tapr" claim. If not, throw an error.
    if (managerProfile.get("customClaims").tapr !== true) {
      throw new HttpsError("permission-denied", "The manager selected does " +
        "not have the required permissions.");
    }
    logger.debug("Job not specified, verifications completed");
  }

  // Get the user's profile from the Profiles collection
  const profile = await db.collection("Profiles").doc(auth.uid).get();
  logger.debug("Profile loaded");

  // create a new purchase order request object with the uid, date, and
  // properties from the data object. The timestamp is generated on the server.
  // We also include the user's displayName for quick reference in the UI.
  const purchaseOrderRequest = {
    // copy existing properties from the data object
    ...data,
    // add new properties, overwriting any existing properties with the same
    // name
    creatorUid: auth.uid,
    creatorName: profile.get("displayName"),
    createdDate: admin.firestore.FieldValue.serverTimestamp(),
    managerApprovedDate: null,
    fullyApproved: false,
    nextApproverClaim: null as string | null,
  };

  // if the endDate property is specified as a number, convert it to a timestamp
  if (data.endDate !== undefined) {
    let endDate: admin.firestore.Timestamp;
    if (typeof data.endDate === "number") {
      endDate = admin.firestore.Timestamp.fromDate(new Date(data.endDate));
      purchaseOrderRequest.endDate = endDate;
    } else {
      endDate = data.endDate;
    }
    // if the endDate property is more than 12 months in the future, throw an
    // error.
    if (endDate.toMillis() > Date.now() + 31536000000) {
      throw new HttpsError("invalid-argument", "The end date cannot be more " +
        "than 12 months in the future.");
    }
  }

  logger.debug("Purchase order request object created");

  // create a reference to a new document in the PurchaseOrderRequests
  const newDoc = db.collection("PurchaseOrderRequests").doc();

  // if there is an attachment, write the new document id to the customMetadata
  // of it in the storage bucket. This will allow us to access the corresponding
  // PurchaseOrderRequest document when the attachment is known.
  if (data.attachment) {
    // get the bucket
    const bucket = admin.storage().bucket();

    // create an array of promises to update the customMetadata of each
    // attachment
    const file = bucket.file(data.attachment);

    // write the customMetadata
    
    await file.setMetadata({
      metadata: {
        purchaseOrderRequestId: newDoc.id,
      },
    });
    logger.info(`Metadata updated for ${data.attachment} to include PurchaseOrderRequest id ${newDoc.id}`);
  } else {
    logger.debug("No attachment specified");
  }

  // write the document to the database
  await newDoc.set(purchaseOrderRequest);

  logger.debug("Purchase order request object added to database");
  return;
  
});

// This is a callable function that will be called from the client to delete a
// PurchaseOrderRequests document. It receives an object containing the document
// id. The uid is read from the auth information. The document is deleted from
// the PurchaseOrderRequests collection. This function uses a transaction to
// ensure that the document is not modified while we delete it.
export const deletePurchaseOrderRequest = onCall(async (callableRequest) => {

  const auth = getAuthObject(callableRequest, ["time", "vp", "smg"]);
  const data = callableRequest.data;

  // validate the data object using the appropriate type guard
  if (!isDocIdObject(data)) {
    throw new HttpsError("invalid-argument", "The function must be called " +
      "with a valid document id object.");
  }

  // get the document reference
  const docRef = db.collection("PurchaseOrderRequests").doc(data.id);

  // run the transaction
  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(docRef);

    // check if the document exists
    if (!doc.exists) {
      throw new HttpsError(
        "not-found",
        "The PurchaseOrderRequest does not exist."
      );
    }

    // if the fullyApproved flag is true, throw an error indicating that the
    // document has already been fully approved and the system will assign a PO
    // number and move it to the PurchaseOrders in a few minutes.
    if (doc.get("fullyApproved") === true) {
      throw new HttpsError("already-exists", "The request has already been " +
        "fully approved. The system will assign a PO number in a few minutes");
    }

    // check if the user is the creator of the document
    if (doc.get("creatorUid") !== auth.uid) {
      throw new HttpsError(
        "permission-denied",
        "You do not have permission to delete this document.");
    }

    transaction.delete(docRef);
  });
});

// This is a callable function that will be called from the client to cancel a
// purchase order. It receives an object containing the document id. The uid is
// read from the auth information. The document is updated in the database to
// indicate that it is cancelled by setting the status field to "Cancelled".
// This function uses a transaction to ensure that the document is not modified
// while we update it (for example having an expense charged against it in the
// future when this is implemented).
export const cancelPurchaseOrder = onCall(async (callableRequest) => {
  const auth = getAuthObject(callableRequest, ["time", "vp", "smg"]);
  const data = callableRequest.data;

  // validate the data object using the appropriate type guard
  if (!isDocIdObject(data)) {
    throw new HttpsError("invalid-argument", "The function must be called " +
      "with a valid document id object.");
  }

  // get the document reference
  const docRef = db.collection("PurchaseOrders").doc(data.id);

  // run the transaction
  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(docRef);

    // if the purchase order is already cancelled, throw an error
    if (doc.get("status") === "Cancelled") {
      throw new HttpsError("already-exists", "The PO has already been " +
        "cancelled.");
    }

    // check if the document exists
    if (!doc.exists) {
      throw new HttpsError(
        "not-found",
        "The PurchaseOrder does not exist."
      );
    }

    // Any VP or SMG can cancel a PO. If the caller has the time claim, they
    // must either be the creator of the document or the manager of the
    // document. Throw an error if neither is true.
    if (auth.token.time === true) {
      if (doc.get("creatorUid") !== auth.uid && doc.get("managerUid") !== auth.uid) {
        throw new HttpsError(
          "permission-denied",
          "You do not have permission to cancel this PO.");
      }
    }

    // update the document
    transaction.update(docRef, {
      status: "Cancelled",
      cancellingUid: auth.uid,
      cancellingName: auth.token.name,
      cancellingDate: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

});

// Mark the PO approved by the calling user. This is accomplished in a
// transaction but depends on the both the calling user's role and the total
// and type of the PurchaseOrderRequest document. If the PurchaseOrderRequest
// requires no further approvals, the "fullyApproved:true" flag is set. A
// separate function will later moved it to the PurchaseOrders collection.
export const approvePurchaseOrderRequest = onCall(async (callableRequest) => {
  const data = callableRequest.data;

  // validate the data object using the appropriate type guard
  if (!isDocIdObject(data)) {
    throw new HttpsError("invalid-argument", "The function must be called " +
      "with a valid document id object.");
  }

  // get the document reference
  const purchaseOrderRequestDoc = db.collection("PurchaseOrderRequests").doc(data.id);

  // run the transaction
  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(purchaseOrderRequestDoc);

    // check if the document exists
    if (!doc.exists) {
      throw new HttpsError("not-found", "The document does not exist.");
    }

    // if the request is rejected, throw an error
    if (doc.get("rejected") === true) {
      throw new HttpsError("failed-precondition", "The request has been " +
        "rejected and cannot be approved.");
    }

    // check if the fullyApproved flag is already set to true. If it is, throw
    // an error indicating that the document has already been fully approved and
    // the system will assign a PO number and move it to the PurchaseOrders in a
    // few minutes.
    if (doc.get("fullyApproved") === true) {
      throw new HttpsError("already-exists", "The document has already been " +
        "fully approved. The system will assign a PO number in a few minutes");
    }

    // if the manager approved date is already present, it has already been
    // approved by the manager but requires further approval by VP or SMG.
    if (doc.get("managerApprovedDate") !== null) {
      // throw if the nextApproverClaim isn't smg or vp. This should never
      // happen if managerApprovedDate is not null.
      if (!["vp", "smg"].includes(doc.get("nextApproverClaim"))) {
        throw new HttpsError("internal", "The nextApproverClaim is invalid.");
      }

      if (doc.get("nextApproverClaim") === "vp") {
        const vpAuth = getAuthObject(callableRequest, ["vp"]);
        return transaction.update(purchaseOrderRequestDoc, {
          vpApprovedDate: admin.firestore.FieldValue.serverTimestamp(),
          vpUid: vpAuth.uid,
          vpName: vpAuth.token.name,
          fullyApproved: true,
        });
      }
      const smgAuth = getAuthObject(callableRequest, ["smg"]);
      return transaction.update(purchaseOrderRequestDoc, {
        smgApprovedDate: admin.firestore.FieldValue.serverTimestamp(),
        smgUid: smgAuth.uid,
        smgName: smgAuth.token.name,
        fullyApproved: true,
      });
    }

    // manager approval is required. Check if the user is the manager of the
    // PurchaseOrderRequest
    const managerAuth = getAuthObject(callableRequest, ["time"]);
    if (doc.get("managerUid") !== managerAuth.uid) {
      throw new HttpsError(
        "permission-denied",
        "You do not have permission to approve this document.");
    }

    // set managerApprovedDate to the current timestamp and, if the total is
    // less than the MANAGER_PO_LIMIT and the type is not "recurring", set the
    // fullyApproved flag to true
    const updateObject = {
      managerApprovedDate: admin.firestore.FieldValue.serverTimestamp(),
      fullyApproved: false,
      nextApproverClaim: null as string | null,
    };

    // determine whether the document should be fully approved or if further
    // approval is required
    if (doc.get("type") === "recurring" || doc.get("total") >= VP_PO_LIMIT) {
      updateObject.nextApproverClaim = "smg";
    } else if (doc.get("total") >= MANAGER_PO_LIMIT) {
      updateObject.nextApproverClaim = "vp";
    } else {
      updateObject.fullyApproved = true;
    }

    // update the document
    return transaction.update(purchaseOrderRequestDoc, updateObject);
  });
});

// This is a scheduled function that runs every 10 minutes to check for any
// PurchaseOrderRequests documents that have fullyApproved:true but do not yet
// have a PO number assigned. It assigns a PO number and moves the document to
// the PurchaseOrders collection, removing it from the PurchaseOrderRequests and
// deleting fields that are no longer relevant.
export const assignPoNumber = onSchedule({
  schedule: "*/5 * * * 1-5", // M-F every 5 minutes,
  timeZone: APP_NATIVE_TZ,
}, async (event) => {
  logger.debug("assignPoNumber function triggered");
  // count the number of documents in the PurchaseOrderRequests collection that
  // are fully approved and ready to have a PO number assigned. If there are
  // none, return silently and log a message.
  const fullyApprovedCount = await db.collection("PurchaseOrderRequests")
    .where("fullyApproved", "==", true)
    .count()
    .get()
    .then((snap) => snap.data().count);
  if (fullyApprovedCount === 0) {
    logger.info("No fully approved PurchaseOrderRequests documents to process");
    return;
  }
 
  // get the latest PO number from the PurchaseOrders collection in this month
  // by querying for the document with the largest PO number that starts with
  // the prefix
  const latestPoSnap = await db.collection("PurchaseOrders")
    .where(admin.firestore.FieldPath.documentId(), "<", yymm(true))
    .orderBy(admin.firestore.FieldPath.documentId(), "desc")
    .limit(1)
    .get();

  let latestSequenceNumber = 0;
  if (!latestPoSnap.empty) {
    latestSequenceNumber = parseInt(latestPoSnap.docs[0].id.split("-")[1], 10);
  }
  
  // nextPurchaseOrderRequestQuery is a query for the next PurchaseOrderRequests
  // document that is fully approved and has not yet been assigned a PO number
  const nextPurchaseOrderRequestQuery = db.collection("PurchaseOrderRequests")
    .where("fullyApproved", "==", true)
    .orderBy("createdDate", "asc")
    .limit(1);

  // now we run the transaction multiple times by generating an array of new PO
  // numbers based on our latestSequenceNumber and the fullyApprovedCount. Then
  // iterating over it. For each iteration of the loop we'll update the next PO
  // number. If the PO number already exists, we will simply return silently and
  // log a message. Next run, the next PO number will be incremented and we'll
  // try again.
  const poNumbers = Array.from(Array(fullyApprovedCount).keys()).map((i) => {
    return yymm() + "-" + String(latestSequenceNumber + i + 1).padStart(4, "0");
  });
  logger.debug(`new po numbers: ${poNumbers}`);

  for (const nextPoNumber of poNumbers) {
    // in a transaction, try to load the next PO number. If it doesn't exist,
    // create the document with the next PO number using the contents of the
    // PurchaseOrderRequests document then delete the PurchaseOrderRequests
    // document. If it does exist, throw an error indicating that the PO number
    // has already been assigned.
    await db.runTransaction(async (transaction) => {
      // get the next PO number
      const poDoc = await transaction.get(db.collection("PurchaseOrders").doc(nextPoNumber));

      // check if the document exists
      if (poDoc.exists) {
        throw new HttpsError("already-exists", "The PO number has already been " +
          "assigned. The system will try a new PO number in a few minutes");
      }

      // get the next PurchaseOrderRequests document
      const porDocs = await transaction.get(nextPurchaseOrderRequestQuery);

      // if there are no documents, return silently and log a message
      if (porDocs.empty) {
        logger.debug("No fully approved PurchaseOrderRequests documents to process");
        return;
      }

      const porDoc = porDocs.docs[0];
      const poObject = porDoc.data();

      delete poObject.fullyApproved;
      delete poObject.attachment;
      poObject.poNumberAssignedDate = admin.firestore.FieldValue.serverTimestamp();
      poObject.status = "Active"; // values are "Active" or "Cancelled" for now

      // create the new document
      transaction.set(poDoc.ref, poObject);
      transaction.delete(porDoc.ref);
      return;
    });
    logger.info(`PO number ${nextPoNumber} assigned`);
  }
});

function yymm(nextMonth = false) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const monthString = String(month).padStart(2, "0");
  const yearString = now.getFullYear().toString().slice(-2);

  if (nextMonth) {
    return yearString + String(month + 1).padStart(2, "0");
  }

  return yearString + monthString;
}