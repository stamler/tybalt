const admin = require('firebase-admin');
const serviceAccount = require('../../../Downloads/serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const claimsToProfiles = require("./claims.js").claimsToProfiles;

// eslint-disable-next-line promise/always-return
claimsToProfiles().then(() => {
  process.exit(0);
}).catch((err) => {
  console.log(err);
  process.exit(1);
});
