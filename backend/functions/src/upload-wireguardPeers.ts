// import data from node CLI

import * as admin from "firebase-admin";
const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function writePeers(filename: string, collection: string) {
  console.log("Writing peers to firestore...");
  // load the file and parse it
  const fs = require("fs");
  const json = JSON.parse(fs.readFileSync(filename));
  const db = admin.firestore();

  // get common data
  const newClientDocSnap = await db.collection("Config").doc("WireGuard").get();
  if (!newClientDocSnap.exists) {
    throw new Error("A WireGuard config document does not exist");
  }
  const newClient = newClientDocSnap.data();
  if (!newClient) {
    throw new Error("The WireGuard config document is empty");
  }
  delete newClient.IPRange;


  for (const item of json) {
    // delete string properties with zero length
    for (const field in item) {
      if (item[field] === "") {
        delete item[field];
      }
    }

    const id = item.AllowedIPs.split("/")[0];
    delete item.AllowedIPs;
    // eslint-disable-next-line no-await-in-loop
    Object.assign(item, newClient);
    await db.collection(collection).doc(id).set(item);
    console.log(`wrote ${id} to firestore`);
  }
}

let collectionArg = "WireGuardClients";
const filenameArg = process.argv[2];
if (process.argv.length === 4) {
  collectionArg = process.argv[3];
} else if (process.argv.length !== 3) {
  console.log(
    "Usage: \nnode upload-wireguardPeers.ts <filename> [<collection>]\n"
  );
  process.exit(1);
} else {
  writePeers(filenameArg, collectionArg)
    .then((result) => {
      return Promise.resolve(process.exit(0));
    })
    .catch((err) => {
      console.log(err);
      process.exit(1);
    });
}
