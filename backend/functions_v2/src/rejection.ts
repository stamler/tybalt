import * as admin from "firebase-admin";
import { logger } from "firebase-functions/v2";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuthObject, isDocIdObject } from "./utilities";


// This function is called with a doc id, a collection name, and a reason
// string. Based on the collection name, it will reject the document with the
// given documentId according to the procedure for that collection. This
// replaces the front end code in RejectModal.vue.
export const rejectDoc = onCall(async (callableRequest) => {
  
  // first check that the request is a valid DocumentIdObject
  const requestData = callableRequest.data;
  // validate the data object using the appropriate type guard
  if (!isDocIdObject(requestData)) {
    throw new HttpsError("invalid-argument", "The function must be called " +
      "with a valid document id object.");
  }

  // if the collectionName is not present in the data object, throw an error.
  // The rejectDoc function should only be called with a collectionName that is
  // present in the data object
  if (requestData.collectionName === undefined) {
    throw new HttpsError("invalid-argument", "Cannot reject without a collectionName property.");
  }
  
  // require a reason property which is a string of length > 5 to be present
  // in the data object
  if (typeof requestData.reason !== "string" || requestData.reason.length < 6) {
    throw new HttpsError("invalid-argument", "You must provide a reason longer than 5 characters for the rejection.");
  }

  const collectionName = requestData.collectionName;
  const reason = requestData.reason;

  // get the document reference
  const db = admin.firestore();
  const docRef = db.collection(collectionName).doc(requestData.id);
  
  await db.runTransaction(async (transaction) => {
    const docSnap = await transaction.get(docRef);
    const documentData = docSnap.data();

    // throw if the document does not exists
    if (!docSnap.exists) {
      throw new HttpsError(
        "not-found",
        `The ${collectionName} document does not exist.`
      );
    }

    // throw if the document is already rejected
    if (documentData?.rejected === true) {
      throw new HttpsError(
        "failed-precondition",
        `The ${collectionName} document is already rejected.`
      );
    }
    
    // based on the collectionName, reject the document
    switch (collectionName) {
      case "TimeSheets":
        const authT = getAuthObject(callableRequest, ["tapr", "tsrej"]);
        // - Allow rejection of submitted or approved timesheets by tapr or
        //   tsrej
        // - prevent rejection of locked timesheets by anybody
        if (documentData?.submitted === true && documentData?.locked === false) {
          // the document is rejectable because it is submitted and not locked
          
          // If tapr is rejecting the document (the caller is not tsrej), throw
          // if the managerUid is not the same as the tapr uid
          if (authT.token.tapr === true && authT.token.tsrej !== true && documentData?.managerUid !== authT.uid) {
            throw new HttpsError("permission-denied", "You are not the manager of this document.");
          }

          logger.info(`Rejecting ${collectionName} document ${requestData.id} by ${authT.token.name}`)
          logger.debug(`uid: ${authT.uid}, name: ${authT.token.name}, reason: ${reason}`)
          transaction.update(docRef, {
            approved: false,
            submitted: false,
            rejected: true,
            rejectorId: authT.uid,
            rejectorName: authT.token.name,
            rejectionReason: reason,
          });
        } else {
          throw new HttpsError("failed-precondition", "The TimeSheets document has not been submitted or is locked");
        }
        break;
      case "Expenses":
        const authE = getAuthObject(callableRequest, ["tapr", "eapr"]);
        // - Allow rejection of submitted or approved expenses by tapr or eapr
        // - prevent rejection of committed expenses by anybody
        if (documentData?.submitted === true && (documentData?.committed === false || documentData?.committed === undefined)) {
          // document is rejectable because it is submitted and not committed

          // If tapr is rejecting the document, throw if the managerUid is not
          // the same as the tapr uid
          if (authE.token.eapr !== true) {
            if (authE.token.tapr === true && documentData?.managerUid !== authE.uid) {
              throw new HttpsError("permission-denied", "You are not the manager of this document.");
            }
          }
          
          logger.info(`Rejecting ${collectionName} document ${requestData.id} by ${authE.token.name}`)
          logger.debug(`uid: ${authE.uid}, name: ${authE.token.name}, reason: ${reason}`)
          transaction.update(docRef, {
            approved: false,
            submitted: false,
            rejected: true,
            rejectorId: authE.uid,
            rejectorName: authE.token.name,
            rejectionReason: reason,
          });
        } else {
          throw new HttpsError("failed-precondition", "The Expenses document has not been submitted or is committed.");
        }
        break;
      case "PurchaseOrderRequests":
        const authP = getAuthObject(callableRequest, ["time", "vp", "smg"]);
        // - Allow rejection of PurchaseOrderRequests by time, vp, or smg
        // - prevent rejection of fullyApproved PurchaseOrderRequests by anybody

        if (documentData?.fullyApproved === false) {
          // document is rejectable because it is not fully approved

          // If the rejector is not vp or smg, throw if the managerUid is not
          // the same as the rejector uid
          if (authP.token.vp === false && authP.token.smg === false && documentData?.managerUid !== authP.uid) {
            throw new HttpsError("permission-denied", "You are not the manager of this document.");
          }

          logger.info(`Rejecting ${collectionName} document ${requestData.id} by ${authP.token.name}`)
          logger.debug(`uid: ${authP.uid}, name: ${authP.token.name}, reason: ${reason}`)
          transaction.update(docRef, {
            rejected: true,
            rejectorId: authP.uid,
            rejectorName: authP.token.name,
            rejectionReason: reason,
          });
        } else {
          throw new HttpsError("failed-precondition", "The PurchaseOrderRequest document is fully approved.");
        }
        break;
      default:
        // throw an error if the collectionName is not recognized
        throw new HttpsError("invalid-argument", `collectionName ${collectionName} ` +
          "was not recognized.");
    }
  });
});