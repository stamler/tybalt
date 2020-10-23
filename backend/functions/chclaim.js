// add or remove custom claims to user from node CLI

const admin = require('firebase-admin');
const serviceAccount = require('../../../../Downloads/serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function chclaim(action, email, claim) {
  const user = await admin.auth().getUserByEmail(email);
  const claims = user.customClaims || {}; // preserve existing claims
  if (action !== 'add' && action !== 'remove' && action !== 'view') {
    return Promise.reject(new Error(`chclaim(): unrecognized action "${action}"`));
  }
  if (action === 'view') {
    return Promise.resolve(claims);
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

let claim = null;
if (process.argv.length === 5) {
  claim = process.argv[4];
} else if (process.argv.length !== 4) {
  console.log('Usage: \nnode chclaim.js add <email> <claim>\nnode chclaim.js remove <email> <claim>\nnode chclaim.js view <email>');
  process.exit(1);
}

const action = process.argv[2];
const email = process.argv[3];

// eslint-disable-next-line promise/always-return
chclaim(action, email, claim).then((result) => {
  if (action === 'view') {
    for (key in result) {
      console.log(`${key}: ${result[key]}`);
    }
    return Promise.resolve(process.exit(0))
  } else {
    console.log(`${action} ${claim} claim to ${email} success`);
    return Promise.resolve(process.exit(0))
  }
}).catch((err) => {
  console.log(`Did not ${action} claim ${claim}: ` + err);
  process.exit(1);
});
