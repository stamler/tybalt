// Reset exported flag on documents in a collection
//
// Usage: npx ts-node reset-export.ts <Collection>
//
// Finds all documents where exported = true and sets exported to false.
// Currently only supports the Expenses collection.
//
// Examples:
//   npx ts-node reset-export.ts Expenses

import * as admin from "firebase-admin";
const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const SUPPORTED_COLLECTIONS = ["Expenses"];

async function resetExportedInCollection(collectionName: string): Promise<number> {
  console.log(
    `Resetting exported flag to false in collection "${collectionName}"...`
  );

  const db = admin.firestore();
  let totalChanges = 0;
  let lastDoc: admin.firestore.QueryDocumentSnapshot | undefined;

  while (true) {
    // Query for documents where exported = true
    let query = db
      .collection(collectionName)
      .where("exported", "==", true)
      .limit(500);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }

    // Use batched writes for efficiency
    const batch = db.batch();
    snapshot.docs.forEach((docSnap) => {
      batch.update(docSnap.ref, { exported: false });
    });

    await batch.commit();
    totalChanges += snapshot.size;
    console.log(`Reset ${snapshot.size} documents (total: ${totalChanges})`);

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  return totalChanges;
}

function printUsage() {
  console.log("Usage: npx ts-node reset-export.ts <Collection>\n");
  console.log("Finds all documents where exported = true and sets exported to false.");
  console.log(`Currently supported collections: ${SUPPORTED_COLLECTIONS.join(", ")}\n`);
  console.log("Examples:");
  console.log("  npx ts-node reset-export.ts Expenses");
}

const args = process.argv.slice(2);

if (args.length !== 1) {
  printUsage();
  process.exit(1);
}

const argCollection = args[0];

if (!SUPPORTED_COLLECTIONS.includes(argCollection)) {
  console.error(
    `Error: Collection "${argCollection}" is not supported.\n` +
    `Supported collections: ${SUPPORTED_COLLECTIONS.join(", ")}`
  );
  process.exit(1);
}

resetExportedInCollection(argCollection)
  .then((totalChanges) => {
    console.log(`\nDone! Reset exported flag on ${totalChanges} documents.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
