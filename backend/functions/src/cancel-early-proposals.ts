/**
 * This was used to cancel all early proposals. It has never been used or
 * tested. If it is going to be used it will have to be tested first to ensure
 * it does what is expected.
 */

import * as admin from "firebase-admin";
const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function cancelProposalsBeforeYear(year: string) {
  console.log(`Cancelling proposals for year ${year} and prior ...`);
  const batches: any[] = [];
  let runCount = 0;
  let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let querySnap: FirebaseFirestore.QuerySnapshot;
  const db = admin.firestore();
  do {
    // eslint-disable-next-line no-await-in-loop
    querySnap = runCount > 0 ?
      await db
        .collection("Jobs")
        .where(admin.firestore.FieldPath.documentId(), ">", "P0")
        .where(admin.firestore.FieldPath.documentId(), "<", `P${year + 1}`)
        .where("status", "==", "Active")
        .startAfter(last)
        .limit(500) // limit 500 writes per batch request
        .get() :
      await db
        .collection("Jobs")
        .where(admin.firestore.FieldPath.documentId(), ">", "P0")
        .where(admin.firestore.FieldPath.documentId(), "<", "P22")
        .where("status", "==", "Active")
        .limit(500) // limit 500 writes per batch request
        .get();
    const batch = db.batch();

    querySnap.forEach((docSnap) => {
      batch.update(docSnap.ref, {
        status: "Cancelled",
      });
    });
    last = querySnap.docs[querySnap.docs.length - 1];

    console.log(`committing ${querySnap.size} documents`);
    //batches.push(batch.commit());
    runCount += 1;
  } while (querySnap.size > 499);
  return Promise.all(batches);
}

if (process.argv.length !== 2) {
  console.log(
    "Usage: \nnode cancel-old-proposals.ts\n"
  );
  process.exit(1);
} else {
  cancelProposalsBeforeYear("21")
    .then((result) => {
      return Promise.resolve(process.exit(0));
    })
    .catch((err) => {
      console.log(err);
      process.exit(1);
    });
}
