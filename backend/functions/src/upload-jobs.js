// import data from node CLI

const admin = require("firebase-admin");
const serviceAccount = require("../../../../Downloads/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function writeJobs(filename, jobtype, collection) {
  console.log("Writing jobs to firestore...");
  // load the file and parse it
  const fs = require("fs");
  const json = JSON.parse(fs.readFileSync(filename));
  const db = admin.firestore();

  for (const item of json) {
    // delete string properties with zero length
    for (const field in item) {
      if (item[field] === "") {
        delete item[field];
      }
    }

    // check if the proposal or project name matches corresponding regex
    // and do any other validation, log and skip if it fails
    const proposalRegex = /^P[0-9]{2}-[0-9]{3,}(-[0-9]+)?$/;
    const projectRegex = /^[0-9]{2}-[0-9]{3,}(-[0-9]+)?$/;
    const regex = jobtype === "proposal" ? proposalRegex : projectRegex;
    if (!regex.test(item.id)) {
      console.log(`job ${item.id} isn't valid, skipping...`);
      continue;
    }
    if (jobtype === "project" && item.proposal !== undefined) {
      if (!proposalRegex.test(item.proposal)) {
        console.log(`invalid proposal format for job ${item.id}, skipping...`);
        continue;
      }
    }

    const id = item.id.slice();
    delete item.id;
    // eslint-disable-next-line no-await-in-loop
    await db.collection(collection).doc(id).set(item);
    console.log(`wrote ${id} to firestore`);
  }
}

let collectionArg = "Jobs";
const filenameArg = process.argv[2];
const jobtypeArg = process.argv[3];
if (process.argv.length === 5) {
  collectionArg = process.argv[4];
} else if (process.argv.length !== 4) {
  console.log(
    "Usage: \nnode upload-jobs.js <filename> <project/proposal> [<collection>]\n"
  );
  process.exit(1);
} else {
  writeJobs(filenameArg, jobtypeArg, collectionArg)
    .then((result) => {
      return Promise.resolve(process.exit(0));
    })
    .catch((err) => {
      console.log(err);
      process.exit(1);
    });
}
