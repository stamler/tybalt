// derrive new data from node CLI

// ATTENTION: This needs to be carefully customized each time it is used
import * as admin from "firebase-admin";
const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function addFieldToCollection(fieldname: string, collection: string) {
  console.log(`Adding field ${fieldname} to documents in collection ${collection} ...`);
  const batches = [];
  let runCount = 0;
  let last = null;
  let querySnap: FirebaseFirestore.QuerySnapshot;
  const db = admin.firestore();
  do {
    // eslint-disable-next-line no-await-in-loop
    querySnap = runCount > 0 ?
      await db
        .collection(collection)
        .where("committed", "==", true) // CUSTOMIZATION POINT
        .startAfter(last)
        .limit(500) // limit 500 writes per batch request
        .get() :
      await db
        .collection(collection)
        .where("committed", "==", true) // CUSTOMIZATION POINT
        .limit(500) // limit 500 writes per batch request
        .get();
    const batch = db.batch();

    querySnap.forEach((docSnap) => {
      batch.update(docSnap.ref, {
        [fieldname]: false, // CUSTOMIZATION POINT
      });
    });
    last = querySnap.docs[querySnap.docs.length - 1];

    console.log(`committing ${querySnap.size} documents`);
    batches.push(batch.commit());
    runCount += 1;
  } while (querySnap.size > 499);
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
