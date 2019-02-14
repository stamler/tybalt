const serverTimestamp = require('firebase-admin').firestore.FieldValue.serverTimestamp
const makeSlug = require('./utilities.js').makeSlug;
const Ajv = require('ajv')
const schema = require('./RawLogins.schema.json')

const ajv = new Ajv({ removeAdditional: true, coerceTypes: true });
/*
 TODO: create a 'removeIfFails' keyword to remove a property if invalid. 
 Use this for email prop https://github.com/epoberezkin/ajv/issues/300

ajv.addKeyword('removeIfFails', {
  inline: function (it, keyword, schema, parentSchema) {},
  metaSchema: { type: 'boolean' }
})
*/

const validate = ajv.compile(schema);

exports.handler = async (req, res, db) => {
  
  // req.body can be used directly as JSON if this passes
  if (req.get('Content-Type') !== "application/json") {
    return res.status(415).send();
  }

  if (req.method !== 'POST') {
    res.header('Allow', 'POST');
    return res.status(405).send();
  }
  
  const d = req.body;

  // Validate the submission
  const valid = validate(d);

  try {
    if(!valid) {
      // Invalid submission, store RawLogin for later processing
      console.log(validate.errors);      
      await db.collection('RawLogins').doc().set(d);
    } else {
      // write valid object to database
      await storeValidLogin(d, db);
    }
    return res.status(202).send();     
  } catch (error) {
    console.log(error.message);
    return res.status(500).send();
  }
}

// Creates or updates Computers and Users document, creates Logins document
async function storeValidLogin(d, db) {
  const slug = makeSlug(d.serial, d.mfg)  // key for Computers collection
  const computerRef = db.collection('Computers').doc(slug)
  let userRef;
  try {
    // try to match existing user, otherwise make a new one. If database
    // inconsistencies are found (i.e. multiple matches) store RawLogin
    userRef = await getUserRef(d, db);
  } catch (error) {
    d.error = error.message;
    return db.collection('RawLogins').doc().set(d);
  }

  // Start a write batch
  var batch = db.batch();

  d.updated = serverTimestamp()
  batch.set(computerRef,d, {merge: true});

  userObject = { upn: d.upn.toLowerCase(), email: d.email.toLowerCase(), 
    givenName: d.userGivenName, surname: d.userSurname, 
    lastComputer: slug, updated: serverTimestamp(),
    userSourceAnchor: d.userSourceAnchor.toLowerCase() };
  // TODO: Check if User has azureObjectID. If it doesn't,
  // try to match it with auth() users by upn/email (Soft match) and then
  // write the key to azureObjectID property
  batch.set(userRef, userObject, {merge: true});

  // Create new Login document
  let loginObject = { userSourceAnchor: d.userSourceAnchor.toLowerCase(),
    givenName: d.userGivenName, surname: d.userSurname, computer: slug };
  batch.set(db.collection('Logins').doc(), loginObject);

  // Commit the batch which returns an array of WriteResults
  return batch.commit();
}

async function getUserRef(d, db) {
  // If I user was deleted from the directory then recreated we don't want to
  // represent them twice in the database. We reuse the same user entry and
  // keep the previous ID/Document. 
  // NB THIS REQUIRES THAT WE STORE d.userSourceAnchor in Users documents
  // The situation where a document exists with a key that matches another 
  // document's userSourceAnchor property is problematic and needs to be 
  // handled in this code. Essentially the key should only coincidentally match
  // a userSourceAnchor

  const usersRef = db.collection('Users');
  for (let prop of ["userSourceAnchor", "upn", "email"]) {
    // query for a user with matching prop
    // eslint-disable-next-line no-await-in-loop
    let result = await usersRef.where(prop, "==", d[prop].toLowerCase()).get();

    // throw if >1 result is returned, caller will set RawLogin
    if ( result.size > 1 ) {
      throw new Error(`Multiple users have ${prop}:${d[prop].toLowerCase()}`);
    }

    // if exactly one result is returned, return its DocumentReference
    else if ( result.size === 1 ) {
      return result.docs[0].ref;
    }
  }

  // if zero results are returned, return a ref to a new document
  // otherwise we'll overwrite an existing user.
  return db.collection('Users').doc();
}