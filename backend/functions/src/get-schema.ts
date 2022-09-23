// import data from node CLI

import * as admin from "firebase-admin";
const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function dumpSchema(collection: string) {
  console.log(`Dumping schema from collection ${collection} ...`);
  const db = admin.firestore();
  const props = new Set();
  // eslint-disable-next-line no-await-in-loop
  const querySnap = await db
    .collection(collection)
    .get();
  console.log(`Found ${querySnap.size} documents`);
  querySnap.forEach((docSnap) => {
    Object.keys(docSnap.data()).forEach((prop) => props.add(prop));
  });
  return props;
}

if (process.argv.length !== 3) {
  console.log(
    "Usage: \nnode get-schema.js <collection>\n"
  );
  process.exit(1);
} else {
  dumpSchema(process.argv[2])
    .then((result) => {
      console.log(result);
      return Promise.resolve(process.exit(0));
    })
    .catch((err) => {
      console.log(err);
      process.exit(1);
    });
}
