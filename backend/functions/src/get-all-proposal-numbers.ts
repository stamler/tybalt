// import data from node CLI

import * as admin from "firebase-admin";
const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount),databaseURL: "https://charade-ca63f.firebaseio.com" });

if (process.argv.length !== 3) {
  console.log(
    "Usage: \nts-node get-all-proposal-numbers.ts <collection>\n"
  );
  process.exit(1);
} else {
  const collection = process.argv[2];
  console.log(`Getting all docs from collection ${collection} ...`);
  const db = admin.firestore();
  db
    .collection(collection)
    .where(admin.firestore.FieldPath.documentId(), ">", "P")
    .orderBy(admin.firestore.FieldPath.documentId())
    .get()
    .then((querySnap => {
      querySnap.docs.map(j => { console.log(j.id) });
      process.exit(0);
    }))
    .catch(err => {
      console.error(err)
      process.exit(1)
    });
}
