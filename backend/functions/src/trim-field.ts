// Trim leading and trailing whitespace from a specified field in a collection
//
// Usage: npx ts-node trim-field.ts <Collection> <PropertyName> [MaxChanges]
//
// Examples:
//   npx ts-node trim-field.ts Jobs client
//   npx ts-node trim-field.ts Jobs description 100

import * as admin from "firebase-admin";
const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function trimFieldInCollection(
  collectionName: string,
  fieldName: string,
  maxChanges?: number
): Promise<number> {
  console.log(
    `Trimming whitespace from field "${fieldName}" in collection "${collectionName}"...`
  );
  if (maxChanges !== undefined) {
    console.log(`Will stop after ${maxChanges} changes.`);
  }

  const db = admin.firestore();
  let lastDoc: admin.firestore.QueryDocumentSnapshot | undefined;
  let totalChanges = 0;
  let totalProcessed = 0;

  while (true) {
    // Check if we've reached the max changes limit
    if (maxChanges !== undefined && totalChanges >= maxChanges) {
      console.log(`Reached max changes limit (${maxChanges}). Stopping.`);
      break;
    }

    // Build query - paginate through all documents
    let query = db.collection(collectionName).limit(500);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }

    totalProcessed += snapshot.size;

    // Process documents one at a time to print changes as they happen
    for (const docSnap of snapshot.docs) {
      // Check if we've reached the max changes limit
      if (maxChanges !== undefined && totalChanges >= maxChanges) {
        break;
      }

      const data = docSnap.data();
      const value = data[fieldName];

      // Only process if the field exists and is a string
      if (typeof value === "string") {
        const trimmed = value.trim();

        // Only update if trimming actually changed the value
        if (trimmed !== value) {
          // Print the change in a compact format with quotes to show whitespace
          console.log(`${docSnap.id}: "${value}" -> "${trimmed}"`);

          await docSnap.ref.update({ [fieldName]: trimmed });
          totalChanges++;
        }
      }
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    console.log(`Processed ${totalProcessed} documents so far...`);
  }

  return totalChanges;
}

function printUsage() {
  console.log(
    "Usage: npx ts-node trim-field.ts <Collection> <PropertyName> [MaxChanges]\n"
  );
  console.log("Examples:");
  console.log("  npx ts-node trim-field.ts Jobs client");
  console.log("  npx ts-node trim-field.ts Jobs description 100");
}

if (process.argv.length < 4 || process.argv.length > 5) {
  printUsage();
  process.exit(1);
}

const argCollection = process.argv[2];
const argField = process.argv[3];
const argMaxChanges = process.argv[4] ? parseInt(process.argv[4], 10) : undefined;

if (argMaxChanges !== undefined && (isNaN(argMaxChanges) || argMaxChanges <= 0)) {
  console.error("Error: MaxChanges must be a positive integer.");
  printUsage();
  process.exit(1);
}

trimFieldInCollection(argCollection, argField, argMaxChanges)
  .then((totalChanges) => {
    console.log(`\nDone! Made ${totalChanges} changes.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
