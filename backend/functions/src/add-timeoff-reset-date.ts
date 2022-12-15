// add a date to the timeOffResetDates array in the AnnualDates document in the
// Config collection of firestore. This date must end in 999 milliseconds which
// cannot be accomplished in the firebase console so we need to do it here.

import * as admin from "firebase-admin";
const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function addDate(date: Date) {
  const db = admin.firestore();
  return db.collection("Config").doc("AnnualDates").update({
    timeOffResetDates: admin.firestore.FieldValue.arrayUnion(date),
  });
}

const dateArg = new Date(process.argv[2]);
if (process.argv.length !== 3) {
  console.log(
    "Usage: \nnode add-timeoff-reset-date.ts <2023-01-08T04:59:59.999Z>\n"
  );
  process.exit(1);
} else {
  console.log(`Adding ${dateArg.toISOString()} to firestore...`);
  addDate(dateArg)
    .then((result) => {
      return Promise.resolve(process.exit(0));
    })
    .catch((err) => {
      console.log(err);
      process.exit(1);
    });
}
