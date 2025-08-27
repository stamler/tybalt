//local-query-runner.ts
// run a query locally so that you can get the required index from the log

import * as admin from "firebase-admin";
const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
export async function runThem() {
  const openingDate = new Date(2020,0,1);
  const querySnapTimeSheets = await db.collection("TimeSheets")
    .where("uid", "==", "0Eb8siijQShe2x29cZmIKYAvIYI3")
    .where("locked", "==", true)
    .where("weekEnding", ">", openingDate)
    .orderBy("weekEnding","desc") // sorted descending so latest element first
    .get();

  // Iterate over the timesheets and come up with a total
  let usedOV = 0;
  let usedOP = 0;
  querySnapTimeSheets.docs.map((tsSnap) => {
    const nonWorkHoursTally = tsSnap.get("nonWorkHoursTally");
    usedOV += nonWorkHoursTally.OV || 0;
    usedOP += nonWorkHoursTally.OP || 0;
  });
  
  // iterate over TimeAmendments and add to existing totals
  const querySnapTimeAmendmentsOV = await db.collection("TimeAmendments")
    .where("uid", "==", "0Eb8siijQShe2x29cZmIKYAvIYI3")
    .where("committed", "==", true)
    .where("committedWeekEnding", ">", openingDate)
    .where("timetype","==","OV")
    .get();
    
  querySnapTimeAmendmentsOV.docs.map((amendSnap) => {
    usedOV += amendSnap.get("hours");
  });

  const querySnapTimeAmendmentsOP = await db.collection("TimeAmendments")
    .where("uid", "==", "0Eb8siijQShe2x29cZmIKYAvIYI3")
    .where("committed", "==", true)
    .where("committedWeekEnding", ">", openingDate)
    .where("timetype","==","OP")
    .get();

  querySnapTimeAmendmentsOP.docs.map((amendSnap) => {
    usedOP += amendSnap.get("hours");
  });

  // the first TimeSheets doc in the query is the latest so will have
  // the latest weekEnding for reporting effective date to the user
  const usedAsOf = querySnapTimeSheets.docs[0].get("weekEnding");
  console.log(usedOV, usedOP, usedAsOf);
}
