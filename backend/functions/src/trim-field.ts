// Trim leading and trailing whitespace from a specified field in a collection
//
// Usage: npx ts-node trim-field.ts <Collection> <PropertyName> [MaxChanges] [--normalize]
//
// Options:
//   --normalize, -n  Also replace consecutive whitespace with a single space
//
// Examples:
//   npx ts-node trim-field.ts Jobs client
//   npx ts-node trim-field.ts Jobs description 100
//   npx ts-node trim-field.ts Expenses vendorName --normalize
//   npx ts-node trim-field.ts Expenses description 100 --normalize

import * as admin from "firebase-admin";
const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

async function trimFieldInCollection(
  collectionName: string,
  fieldName: string,
  maxChanges?: number,
  normalize?: boolean
): Promise<number> {
  const mode = normalize ? "Normalizing" : "Trimming";
  console.log(
    `${mode} whitespace in field "${fieldName}" in collection "${collectionName}"...`
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
        const processed = normalize ? normalizeWhitespace(value) : value.trim();

        // Only update if processing actually changed the value
        if (processed !== value) {
          // Print the change in a compact format with quotes to show whitespace
          console.log(`${docSnap.id}: "${value}" -> "${processed}"`);

          await docSnap.ref.update({ [fieldName]: processed });
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
    "Usage: npx ts-node trim-field.ts <Collection> <PropertyName> [MaxChanges] [--normalize]\n"
  );
  console.log("Options:");
  console.log("  --normalize, -n  Also replace consecutive whitespace with a single space\n");
  console.log("Examples:");
  console.log("  npx ts-node trim-field.ts Jobs client");
  console.log("  npx ts-node trim-field.ts Jobs description 100");
  console.log("  npx ts-node trim-field.ts Expenses vendorName --normalize");
  console.log("  npx ts-node trim-field.ts Expenses description 100 --normalize");
}

// Parse arguments, separating flags from positional args
const args = process.argv.slice(2);
const flags = args.filter((arg) => arg.startsWith("-"));
const positionalArgs = args.filter((arg) => !arg.startsWith("-"));

const argNormalize = flags.includes("--normalize") || flags.includes("-n");

if (positionalArgs.length < 2 || positionalArgs.length > 3) {
  printUsage();
  process.exit(1);
}

const argCollection = positionalArgs[0];
const argField = positionalArgs[1];
const argMaxChanges = positionalArgs[2] ? parseInt(positionalArgs[2], 10) : undefined;

if (argMaxChanges !== undefined && (isNaN(argMaxChanges) || argMaxChanges <= 0)) {
  console.error("Error: MaxChanges must be a positive integer.");
  printUsage();
  process.exit(1);
}

trimFieldInCollection(argCollection, argField, argMaxChanges, argNormalize)
  .then((totalChanges) => {
    console.log(`\nDone! Made ${totalChanges} changes.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
