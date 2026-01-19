// immutableId.ts
// Generate immutableID for new documents to serve as stable PocketBase ID

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { customAlphabet } from "nanoid";

const db = admin.firestore();

// PocketBase-compatible ID alphabet: lowercase letters and digits, 15 characters
const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 15);

/**
 * Factory function that creates a Firestore trigger to generate immutableID for new documents.
 * The immutableID will be used as the pocketbase_id during import into tybalt_turbo.
 * 
 * @param collectionName - The Firestore collection to watch for new documents
 */
function createImmutableIDTrigger(collectionName: string) {
  return onDocumentCreated(`${collectionName}/{docId}`, async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.warn("No data associated with the event");
      return;
    }

    const docData = snapshot.data();
    
    // Skip if immutableID already exists (idempotency)
    if (docData.immutableID) {
      logger.debug(`immutableID already exists for ${collectionName} document ${snapshot.id}`);
      return;
    }

    const immutableID = nanoid();
    
    await db.collection(collectionName).doc(snapshot.id).update({ immutableID });
    logger.info(`immutableID ${immutableID} added to ${collectionName} document ${snapshot.id}`);
  });
}

// Export triggers for each collection that needs immutableID
export const addJobsImmutableID = createImmutableIDTrigger("Jobs");
export const addExpensesImmutableID = createImmutableIDTrigger("Expenses");
