import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { Storage } from "@google-cloud/storage";
import { FIREBASE_CONFIG } from "./config";

const db = admin.firestore();
const storage = new Storage();

// Configuration constants
const MIRROR_BUCKET = "tybalt-turbo-mirror";
const LEGACY_BUCKET = FIREBASE_CONFIG.storageBucket; // charade-ca63f.appspot.com
const EXPENSES_COLLECTION_ID = "o1vpz1mm7qsfoyy"; // expenses collection ID in PocketBase

/**
 * Processes writeback attachments for EXPENSES ONLY.
 *
 * Purchase Orders do NOT use this function - their attachment fields
 * pass through as strings referencing S3 objects directly.
 *
 * For each expense document with a PocketBase-style attachment:
 * 1. Looks up the file in the GCS mirror bucket
 * 2. Copies it to the legacy Firebase Storage bucket with proper naming
 * 3. Updates the attachment field in the staging document
 *
 * @returns Object with counts of processed, skipped, and errored documents
 */
export async function processExpenseWritebackAttachments(): Promise<{
  processed: number;
  skipped: number;
  errors: string[];
}> {
  const sourceSnap = await db.collection("TurboExpensesWriteback").get();

  if (sourceSnap.empty) {
    functions.logger.info(
      "No TurboExpensesWriteback documents to process attachments for"
    );
    return { processed: 0, skipped: 0, errors: [] };
  }

  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  const mirrorBucket = storage.bucket(MIRROR_BUCKET);
  const legacyBucket = storage.bucket(LEGACY_BUCKET);

  for (const doc of sourceSnap.docs) {
    const data = doc.data();
    const attachment = data.attachment as string | undefined;
    const attachmentHash = data.attachmentHash as string | undefined;
    const uid = data.uid as string;

    // Skip if no attachment
    if (!attachment) {
      skipped++;
      continue;
    }

    // Skip if already processed (attachment starts with Writeback/ or legacy format)
    if (attachment.startsWith("Writeback/") || attachment.startsWith("Expenses/")) {
      skipped++;
      continue;
    }

    // Validate we have required fields for processing
    if (!attachmentHash) {
      const errorMsg = `Document ${doc.id} has attachment but no attachmentHash`;
      functions.logger.error(errorMsg);
      errors.push(errorMsg);
      continue;
    }

    if (!uid) {
      const errorMsg = `Document ${doc.id} has attachment but no uid`;
      functions.logger.error(errorMsg);
      errors.push(errorMsg);
      continue;
    }

    // Construct paths
    // PocketBase path: {collection_id}/{record_id}/{filename}
    // The attachment field contains just the filename, so we need the PocketBase
    // record ID. In writeback, the Firestore doc ID is immutableID (the PocketBase
    // record ID), so prefer the explicit immutableID field and fall back to doc.id.
    const pocketbaseRecordId = data.immutableID || doc.id;
    const sourcePath = `${EXPENSES_COLLECTION_ID}/${pocketbaseRecordId}/${attachment}`;

    // Extract extension from PocketBase filename
    const lastDotIndex = attachment.lastIndexOf(".");
    const ext = lastDotIndex >= 0 ? attachment.substring(lastDotIndex) : "";

    // Legacy path with Writeback prefix
    const destPath = `Writeback/Expenses/${uid}/${attachmentHash}${ext}`;

    try {
      // Check if source file exists in mirror
      const sourceFile = mirrorBucket.file(sourcePath);
      const [exists] = await sourceFile.exists();

      if (!exists) {
        const errorMsg = `Source file not found in mirror: ${sourcePath} (doc ${doc.id})`;
        functions.logger.error(errorMsg);
        errors.push(errorMsg);
        continue;
      }

      // Check if destination already exists (idempotency)
      const destFile = legacyBucket.file(destPath);
      const [destExists] = await destFile.exists();

      if (!destExists) {
        // Copy file to legacy bucket
        await sourceFile.copy(destFile);
        functions.logger.debug(`Copied ${sourcePath} to ${destPath}`);
      }

      // Update the document's attachment field
      await doc.ref.update({ attachment: destPath });
      processed++;
      functions.logger.debug(`Updated attachment for doc ${doc.id}: ${destPath}`);
    } catch (error) {
      const errorMsg = `Failed to process attachment for doc ${doc.id}: ${error}`;
      functions.logger.error(errorMsg);
      errors.push(errorMsg);
    }
  }

  functions.logger.info(
    `Expense attachment processing complete: ` +
      `${processed} processed, ${skipped} skipped, ${errors.length} errors`
  );

  return { processed, skipped, errors };
}
