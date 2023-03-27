// import data from node CLI

import * as admin from "firebase-admin";
import * as fs from "fs"; 
const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount),databaseURL: "https://charade-ca63f.firebaseio.com" });

const collection = "Jobs";
const property = "manager";
console.log(`Getting all docs from collection ${collection} with property ${property}...`);

// load uid JSON from file
const uidMap = JSON.parse(fs.readFileSync("uid-map.json", "utf8"));

setManagerUid().then((vals) => {
  process.exit(0);
})
.catch(err => {
  console.error(err)
  process.exit(1)
});

async function setManagerUid() {
  const firestore = admin.firestore();
  const db = admin.firestore();
  const batches = [];
  let lastDoc: admin.firestore.QueryDocumentSnapshot | undefined;

  while (true) {
    let query = firestore.collection("Jobs")
      .orderBy("manager")
      .limit(400);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    // the batch to complete this group of 400 docs
    const batch = db.batch();

    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }

    snapshot.forEach(doc => {

      // if the doc already has a managerUid, skip it
      if (doc.get("managerUid") !== undefined) {
        console.log(`Skipping ${doc.id} because it already has a managerUid`);
        return;
      }

      // clean the manager property from the document. If it has separators,
      // skip it
      const clean = doc.get("manager").toLowerCase().replace(/\s*\/\s*/g, ",").replace(/\s*,\s*/g, ",").trim();
      if (clean.includes(",")) {
        console.log(`Skipping ${doc.id} because it has multiple managers`);
        return;
      }

      // get the correct uid by looking up the manager from the document in the
      // uid map
      if (!uidMap[clean]) {
        console.error(`Could not find uid for ${clean} in uid map`);
        return;
      }
      const { uid, displayName } = uidMap[clean];

      console.log(`Updating ${doc.id}:${ doc.get("manager")} with managerUid ${uid} and managerDisplayName ${displayName}`);
      batch.update(doc.ref, {
        managerUid: uid,
        managerDisplayName: displayName,
      });
    });

    batches.push(batch.commit());
    console.log(`Processed ${snapshot.docs.length} docs, lastDoc: ${lastDoc?.id}`);
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  return Promise.all(batches);
}