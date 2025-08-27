// import data from node CLI

import * as admin from "firebase-admin";
import * as fs from "fs";
const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount),databaseURL: "https://charade-ca63f.firebaseio.com" });

console.log("Creating mappings of various display name interpretations to UIDs...");


// generate and output the mappings
createMap().then((map) => {
  for (const [key, value] of map) {
    console.log(`${key}: ${JSON.stringify(value)}`);
  }
  console.log("Writing mappings to file...");
  fs.writeFileSync("uid-map.json", JSON.stringify(Object.fromEntries(map)));
  process.exit(0);
})
  .catch(err => {
    console.error(err)
    process.exit(1)
  });

async function createMap(): Promise<Map<string,{ uid: string, displayName: string }>> {
  const firestore = admin.firestore();
  const mappings = new Map<string, { uid: string, displayName: string }>();

  // get all profiles documents
  const querySnap = await firestore.collection("Profiles").get();

  // for each profile document, generate multiple mappings
  querySnap.forEach(snapshot => {
    // generate the lowercase version of the display name
    const lower = snapshot.get("displayName").toLowerCase();
    
    // generate the lowercase first name with the first letter of the last name
    const first_last_init = `${snapshot.get("givenName").toLowerCase()} ${snapshot.get("surname").charAt(0).toLowerCase()}`;

    // generate the lowercase first name with the first letter of all the last names
    const first_last_inits = `${snapshot.get("givenName").toLowerCase()} ${snapshot.get("surname").split(" ").map((s: string) => s.charAt(0).toLowerCase()).join("")}`;

    // generate the lowercase first name initials with last name
    const first_inits_last = `${snapshot.get("givenName").split(" ").map((s: string) => s.toLowerCase().charAt(0)).join("")} ${snapshot.get("surname").toLowerCase()}`;

    // write the mappings to the map, skipping and then warning any that already exist
    if (mappings.has(lower) && mappings.get(lower)?.uid !== snapshot.id) {
      console.warn(`Duplicate mapping for ${lower} with UIDs ${mappings.get(lower)?.uid} and ${snapshot.id}`);
    } else {
      mappings.set(lower, { uid: snapshot.id, displayName: snapshot.get("displayName")});
    }
    if (mappings.has(first_last_init) && mappings.get(first_last_init)?.uid !== snapshot.id) {
      console.warn(`Duplicate mapping for ${first_last_init} with UIDs ${mappings.get(first_last_init)?.uid} and ${snapshot.id}`);
    } else {
      mappings.set(first_last_init, { uid: snapshot.id, displayName: snapshot.get("displayName")});
    }
    if (mappings.has(first_last_inits) && mappings.get(first_last_inits)?.uid !== snapshot.id) {
      console.warn(`Duplicate mapping for ${first_last_inits} with UIDs ${mappings.get(first_last_inits)?.uid} and ${snapshot.id}`);
    } else {
      mappings.set(first_last_inits, { uid: snapshot.id, displayName: snapshot.get("displayName")});
    }
    if (mappings.has(first_inits_last) && mappings.get(first_inits_last)?.uid !== snapshot.id) {
      console.warn(`Duplicate mapping for ${first_inits_last} with UIDs ${mappings.get(first_inits_last)?.uid} and ${snapshot.id}`);
    } else {
      mappings.set(first_inits_last, { uid: snapshot.id, displayName: snapshot.get("displayName")});
    }
  });

  return mappings;
}