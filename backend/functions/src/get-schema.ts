// import data from node CLI

import * as admin from "firebase-admin";
const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

function computeIfAbsent<K, V>(map: Map<K, V>, key: K, mappingFunction: (k: K) => V): V {
  let val = map.get(key);
  if (typeof val === "undefined") {
      val = mappingFunction(key);
      map.set(key, val);
  }
  return val;
}

async function dumpSchema(collection: string) {
  console.log(`Dumping schema from collection ${collection} ...`);
  const db = admin.firestore();
  const props = new Map<string, Set<string>>();
  // eslint-disable-next-line no-await-in-loop
  const querySnap = await db
    .collection(collection)
    .get();
  console.log(`Found ${querySnap.size} documents`);
  querySnap.forEach((docSnap) => {
    Object.keys(docSnap.data()).forEach((prop) => {
      // if the property is not in the map, add it
      const thisSet = computeIfAbsent(props, prop, () => new Set<string>());

      // TODO: if the property is of type object, be more specific
      const type = typeof docSnap.data()[prop];
      
      thisSet.add(type);
    });
  });
  // TODO: enumerate optional properties by checking for undefined on a second
  // pass
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
