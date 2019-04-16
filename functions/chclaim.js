// add or remove custom claims to user from node CLI

const admin = require('firebase-admin');
const serviceAccount = require('../../../Downloads/serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function chclaim(action, email, claim) {
  const user = await admin.auth().getUserByEmail(email);
  const claims = user.customClaims || {}; // preserve existing claims
  console.log(`${user.displayName}'s existing claims: ${JSON.stringify(claims)}`);
  if (action !== 'add' && action !== 'remove') {
    return Promise.reject(new Error(`chclaim(): unrecognized action "${action}"`));
  }
  if (claims && claims[claim] === true) {
    if (action === 'remove') {
      delete claims[claim];
      return admin.auth().setCustomUserClaims(user.uid, claims);
    } else if (action === 'add') {
      return Promise.reject(new Error(`${user.displayName} already has claim "${claim}"`));
    }
  }
  if (action === 'remove') {
    return Promise.reject(new Error(`${user.displayName} missing claim ${claim}`));
  } else if (action === 'add') {
    claims[claim] = true;
    return admin.auth().setCustomUserClaims(user.uid, claims);  
  }
  return Promise.reject(new Error("Other shit went down"));
}

if (process.argv.length !== 5) {
  console.log('Usage: \nnode chclaim.js add <claim> <email>\nnode chclaim.js remove <claim> <email>');
  process.exit(1);
}

const action = process.argv[2]
const claim = process.argv[3];
const email = process.argv[4];

// eslint-disable-next-line promise/always-return
chclaim(action, email, claim).then(() => {
  console.log(`${action} ${claim} claim to ${email} success`);
  process.exit(0);
}).catch((err) => {
  console.log(`Did not ${action} claim ${claim}: ` + err);
  process.exit(1);
});
