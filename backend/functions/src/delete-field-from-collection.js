// import data from node CLI

const admin = require("firebase-admin");
const serviceAccount = require("../../../../Downloads/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function deleteFieldInCollection(fieldname, collection) {
  console.log(`Deleting field ${fieldname} from collection ${collection} ...`);
  const batches = [];
  let moreRemaining = true;
  const db = admin.firestore();
  while (moreRemaining) {
    // eslint-disable-next-line no-await-in-loop
    const querySnap = await db
      .collection(collection)
      .orderBy(fieldname)
      .limit(500) // limit 500 writes per batch request
      .get();
    const batch = db.batch();

    querySnap.forEach((docSnap) => {
      batch.update(docSnap.ref, {
        [fieldname]: admin.firestore.FieldValue.delete(),
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
    "Usage: \nnode delete-field-from-collection.js <fieldname> <collection>\n"
  );
  process.exit(1);
} else {
  deleteFieldInCollection(process.argv[2], process.argv[3])
    .then((result) => {
      return Promise.resolve(process.exit(0));
    })
    .catch((err) => {
      console.log(err);
      process.exit(1);
    });
}
