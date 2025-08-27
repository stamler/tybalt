// import data from node CLI

import * as admin from "firebase-admin";
const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount),databaseURL: "https://charade-ca63f.firebaseio.com" });

const collection = "Jobs";
const property = "manager";
console.log(`Getting all docs from collection ${collection} with property ${property}...`);

const histoMode = true;

if (!histoMode) {
  // get all unique values where a given item can have multiple values in the
  // property
  getDistinctPropertyValues(collection, property).then((vals) => {
    for (const val of vals) {
      console.log(val);
    }
    process.exit(0);
  })
    .catch(err => {
      console.error(err)
      process.exit(1)
    });
}
// make a histogram of the values where a given item's property value is treated
// as monolithic but cleaned up
getDistinctPropertyValues(collection, property, true).then((vals) => {
  // sort by count
  const map = vals as Map<string, number>;
  const sorted = Array.from(map).sort((a, b) => b[1] - a[1]);

  for (const [key, value] of sorted) {
    console.log(`${key}: ${value}`);
  }
  process.exit(0);
})
  .catch(err => {
    console.error(err)
    process.exit(1)
  });

async function getDistinctPropertyValues(collectionPath: string, propertyName: string, histogramMode = false): Promise<string[] | Map<string,number>> {
  const firestore = admin.firestore();
  const values = new Set<string>();
  const histogram = new Map<string, number>();
  let lastDoc: admin.firestore.QueryDocumentSnapshot | undefined;

  while (true) {
    let query = firestore.collection(collectionPath)
      .orderBy(propertyName)
      .limit(1000);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }

    snapshot.forEach(doc => {
      const value = doc.get(propertyName) as string;
      // cleaned up values
      // 1. set to lowercase
      // 2. replace / with , (for example, "A/B" becomes "A,B") removing any whitespace
      // 3. remove whitespace from beginning and end of commas
      // 4. trim whitespace from beginning and end of string
      const clean = value.toLowerCase().replace(/\s*\/\s*/g, ",").replace(/\s*,\s*/g, ",").trim();
      if (value) {
        if (histogramMode) {
          // histogram mode. Instead of adding each value to the set to get
          // unique values, we add each value to a histogram and increment the
          // count for each value.
          if (histogram.has(clean)) {
            histogram.set(clean, histogram.get(clean)! + 1);
          } else {
            histogram.set(clean, 1);
          }
        } else {
          // split on commas and add each item to set
          clean.split(",").forEach(val => { values.add(val); });
        }
      }
    });

    console.log(`Processed ${snapshot.docs.length} docs, lastDoc: ${lastDoc?.id}`);
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  return histogramMode ? histogram : Array.from(values).sort();
}