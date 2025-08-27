// derrive new data from node CLI

// Get the profiles with recent msGraphDataUpdated field and set it to 10 days
// old This is a utility script to 'touch' profiles so that other scripts will
// run on them Its only side-effect besides the msGraphDataUpdated field is that
// it will force a user to re-login to the app the next time it is loaded

import * as admin from "firebase-admin";
import { subDays } from "date-fns";
const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function expireMsGraphDataUpdated() {
  console.log("Expiring all profiles with current msGraphDataUpdated field ...");
  const db = admin.firestore();

  // get all Profiles documents with msGraphDataUpdated field
  const querySnap = await db
    .collection("Profiles")
    .orderBy("msGraphDataUpdated")
    .get();
  const batch = db.batch();

  querySnap.forEach((docSnap) => {
    // if the msGraphDataUpdated field is newer than 10 days, set it 10 days old
    if (docSnap.get("msGraphDataUpdated").toDate() > subDays(new Date(), 10)) {
      batch.update(docSnap.ref, {
        msGraphDataUpdated: admin.firestore.Timestamp.fromDate(subDays(new Date(), 10)),
      });
      console.log(`expiring ${docSnap.get("displayName")}`);
    }
  });
  return batch.commit();
}

if (process.argv.length !== 2) {
  console.log(
    "Usage: \nexpire-profiles.js\n"
  );
  process.exit(1);
} else {
  expireMsGraphDataUpdated()
    .then(() => {
      return Promise.resolve(process.exit(0));
    })
    .catch((err) => {
      console.log(err);
      process.exit(1);
    });
}
