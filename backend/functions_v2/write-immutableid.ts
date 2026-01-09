/**
 * Backfill script to add immutableID to existing documents in a Firestore collection.
 * 
 * Usage: npx ts-node write-immutableid.ts <CollectionName> [limit]
 * Example: npx ts-node write-immutableid.ts Jobs        # Process all documents
 * Example: npx ts-node write-immutableid.ts Jobs 10     # Process only 10 documents (for testing)
 * 
 * This script:
 * - Takes a collection name as CLI argument
 * - Optionally takes a limit for number of documents to process
 * - Iterates through documents in the collection
 * - Adds immutableID to documents that don't have one
 * - Uses batched writes for efficiency (max 500 per batch)
 * - Provides progress logging
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { customAlphabet } from "nanoid";

// Use service account credentials (same pattern as scripts in backend/functions)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const serviceAccount = require("../../../../Downloads/serviceAccountKey.json");
initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

// PocketBase-compatible ID alphabet: lowercase letters and digits, 15 characters
const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 15);

const BATCH_SIZE = 500; // Firestore max batch size

async function assignImmutableID(collectionName: string, limit?: number): Promise<void> {
  console.log(`Starting immutableID backfill for collection: ${collectionName}`);
  if (limit) {
    console.log(`Limiting to ${limit} documents (test mode)`);
  }
  
  const collectionRef = db.collection(collectionName);
  const snapshot = await collectionRef.get();
  
  const totalDocs = snapshot.size;
  const docsToProcess = limit ? snapshot.docs.slice(0, limit) : snapshot.docs;
  
  console.log(`Found ${totalDocs} documents in ${collectionName}, processing ${docsToProcess.length}`);
  
  let processedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let batch = db.batch();
  let batchCount = 0;
  
  for (const doc of docsToProcess) {
    const data = doc.data();
    
    if (data.immutableID) {
      // Document already has an immutableID, skip it
      skippedCount++;
    } else {
      // Generate and add immutableID
      const immutableID = nanoid();
      batch.update(doc.ref, { immutableID });
      updatedCount++;
      batchCount++;
      
      // Commit batch when it reaches max size
      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        console.log(`Committed batch of ${batchCount} updates (${processedCount + 1} / ${docsToProcess.length} processed)`);
        batch = db.batch();
        batchCount = 0;
      }
    }
    
    processedCount++;
    
    // Log progress every 1000 documents
    if (processedCount % 1000 === 0) {
      console.log(`Progress: ${processedCount} / ${docsToProcess.length} documents processed`);
    }
  }
  
  // Commit any remaining updates
  if (batchCount > 0) {
    await batch.commit();
    console.log(`Committed final batch of ${batchCount} updates`);
  }
  
  console.log(`\nBackfill complete for ${collectionName}:`);
  console.log(`  Total documents in collection: ${totalDocs}`);
  console.log(`  Documents processed: ${docsToProcess.length}`);
  console.log(`  Updated (new immutableID): ${updatedCount}`);
  console.log(`  Skipped (already had immutableID): ${skippedCount}`);
}

// Main execution
const collectionName = process.argv[2];
const limitArg = process.argv[3];
const limit = limitArg ? parseInt(limitArg, 10) : undefined;

if (!collectionName) {
  console.error("Error: Please provide a collection name as an argument.");
  console.error("Usage: npx ts-node write-immutableid.ts <CollectionName> [limit]");
  console.error("Example: npx ts-node write-immutableid.ts Jobs");
  console.error("Example: npx ts-node write-immutableid.ts Jobs 10");
  process.exit(1);
}

if (limitArg && (isNaN(limit!) || limit! <= 0)) {
  console.error("Error: Limit must be a positive number.");
  process.exit(1);
}

assignImmutableID(collectionName, limit)
  .then(() => {
    console.log("\nImmutableID assignment complete.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error assigning immutableID:", error);
    process.exit(1);
  });
