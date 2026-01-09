// immutableId.ts
// Generate immutableID for new Jobs documents to serve as stable PocketBase ID

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { customAlphabet } from "nanoid";

const db = admin.firestore();

// PocketBase-compatible ID alphabet: lowercase letters and digits, 15 characters
const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 15);

/**
 * Firestore trigger that generates an immutableID for new Jobs documents.
 * This ID will be used as the pocketbase_id during import into tybalt_turbo.
 */
export const addJobsImmutableID = onDocumentCreated("Jobs/{jobId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    logger.warn("No data associated with the event");
    return;
  }

  const jobData = snapshot.data();
  
  // Skip if immutableID already exists (idempotency)
  if (jobData.immutableID) {
    logger.debug(`immutableID already exists for document ${snapshot.id}`);
    return;
  }

  const immutableID = nanoid();
  
  await db.collection("Jobs").doc(snapshot.id).update({ immutableID });
  logger.info(`immutableID ${immutableID} added to Jobs document ${snapshot.id}`);
});
