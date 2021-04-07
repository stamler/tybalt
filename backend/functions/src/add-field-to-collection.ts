// derrive new data from node CLI

// ATTENTION: This needs to be carefully customized each time it is used
import * as admin from "firebase-admin";
const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function addFieldToCollection(fieldname: string, collection: string) {
  console.log(`Adding field ${fieldname} to all documents in collection ${collection} ...`);
  const batches = [];
  let moreRemaining = true;
  const db = admin.firestore();
  while (moreRemaining) {
    // eslint-disable-next-line no-await-in-loop
    const querySnap = await db
      .collection(collection)
      .orderBy("jobsTally")  // CUSTOMIZATION POINT
      .limit(500) // limit 500 writes per batch request
      .get();
    const batch = db.batch();

    querySnap.forEach((docSnap) => {
      batch.update(docSnap.ref, {
        [fieldname]: Object.keys(docSnap.get("jobsTally")), // CUSTOMIZATION POINT
      });
    });

    moreRemaining = querySnap.size > 500;
    console.log(`committing ${querySnap.size} documents`);
    batches.push(batch.commit());
  }
  return Promise.all(batches);
}

if (process.argv.length !== 4) {
  console.log(
    "Usage: \nnode add-field-to-collection.js <fieldname> <collection>\n"
  );
  process.exit(1);
} else {
  addFieldToCollection(process.argv[2], process.argv[3])
    .then((result) => {
      return Promise.resolve(process.exit(0));
    })
    .catch((err) => {
      console.log(err);
      process.exit(1);
    });
}
