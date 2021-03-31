// import data from ts-node CLI

import * as admin from "firebase-admin";
const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

import algoliasearch from "algoliasearch";

async function updateAlgoliaIndexFromCollection(indexName: string, collection: string, appid: string, apikey: string) {

  // setup the Algolia client and index
  const client = algoliasearch(appid, apikey);
  const index = client.initIndex(indexName);
  const db = admin.firestore();

  const documents = await db.collection(collection).get();
  console.log(`${documents.size} documents found in collection ${collection}`);
  for (const doc of documents.docs) {
    const obj = doc.data();
    obj.objectID = doc.id;
    await index.saveObject(obj);
    console.log(`wrote ${doc.id} to algolia index ${indexName}`);
  };
}

const indexName = process.argv[2];
const collection = process.argv[3];
const appId = process.argv[4];
const apiKey = process.argv[5];
if (process.argv.length !== 6) {
  console.log(
    "Usage: \nnode collection-to-algolia.js <indexName> <collection> <algolia_appid> <algolia_apikey>\n"
  );
  process.exit(1);
} else {  
  updateAlgoliaIndexFromCollection(indexName, collection, appId, apiKey)
    .then((result) => {
      return Promise.resolve(process.exit(0));
    })
    .catch((err) => {
      console.log(err);
      process.exit(1);
    });
}
