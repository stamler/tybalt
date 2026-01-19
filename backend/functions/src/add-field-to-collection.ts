// Please see file-5lj.ts for proposal to replace this script with a more
// general solution that applies a function to each document in a collection.

// derrive new data from node CLI

// ATTENTION: This needs to be carefully customized each time it is used
import * as admin from "firebase-admin";
const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function addFieldToCollection(fieldname: string, collection: string, limit?: number) {
  const limitMsg = limit ? ` (limit: ${limit} documents)` : "";
  console.log(`Adding field ${fieldname} to documents in collection ${collection}${limitMsg} ...`);
  const batches = [];
  let runCount = 0;
  let last = null;
  let totalProcessed = 0;
  let batchSize = 500;
  let querySnap: FirebaseFirestore.QuerySnapshot;
  const db = admin.firestore();
  do {
    batchSize = limit ? Math.min(500, limit - totalProcessed) : 500;
    if (batchSize <= 0) break;
    
    // eslint-disable-next-line no-await-in-loop
    querySnap = runCount > 0 ?
      await db
        .collection(collection)
        .orderBy("EXISTING_FIELD") // CUSTOMIZATION POINT
        .startAfter(last)
        .limit(batchSize)
        .get() :
      await db
        .collection(collection)
        .orderBy("EXISTING_FIELD") // CUSTOMIZATION POINT
        .limit(batchSize)
        .get();
    const batch = db.batch();

    querySnap.forEach((docSnap) => {
      batch.update(docSnap.ref, {
        [fieldname]: false, // CUSTOMIZATION POINT - set to false for resetting exported flag
      });
    });
    last = querySnap.docs[querySnap.docs.length - 1];
    totalProcessed += querySnap.size;

    console.log(`committing ${querySnap.size} documents (total: ${totalProcessed})`);
    batches.push(batch.commit());
    runCount += 1;
  } while (querySnap.size >= batchSize && (!limit || totalProcessed < limit));
  return Promise.all(batches);
}

if (process.argv.length < 4 || process.argv.length > 5) {
  console.log(
    "Usage: \nnode add-field-to-collection.js <fieldname> <collection> [limit]\n" +
    "\nOptional limit parameter restricts processing to N documents (for testing).\n"
  );
  process.exit(1);
} else {
  const limit = process.argv[4] ? parseInt(process.argv[4], 10) : undefined;
  if (process.argv[4] && (isNaN(limit!) || limit! <= 0)) {
    console.log("Error: limit must be a positive integer");
    process.exit(1);
  }
  addFieldToCollection(process.argv[2], process.argv[3], limit)
    .then((result) => {
      return Promise.resolve(process.exit(0));
    })
    .catch((err) => {
      console.log(err);
      process.exit(1);
    });
}
