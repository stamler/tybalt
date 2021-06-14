import * as functions from "firebase-functions";
import algoliasearch from "algoliasearch";
const env = functions.config();

// update the specified index using the after data in the ChangeJson
// if change.after exists, push the data
// if change.after doesn't exist, delete the objectId
// https://firebase.google.com/docs/firestore/solutions/search#solution_algolia
export async function updateAlgoliaIndex(
  change: functions.ChangeJson,
  context: functions.EventContext,
  indexName: string,
) {
  // setup the Algolia client and index
  const client = algoliasearch(env.algolia.appid, env.algolia.apikey);
  const index = client.initIndex(indexName);

  const afterData = change.after?.data();
  if (afterData === undefined) {
    // The document was deleted, remove from algolia index
    functions.logger.log(`${change.after.ref.id} was deleted. Removing corresponding object from Algolia`)
    return index.deleteObject(change.after.ref.id);
  }

  // The document was either created or updated
  // Add an 'objectID' field required by Algolia then save to index
  afterData.objectID = change.after.ref.id;

  // create a searchKeys field that is an array of derived values including
  // just the numbers from the ID
  afterData.searchKeys = [change.after.ref.id.replace(/[-P ]/g,"")];
  functions.logger.log(`${change.after.ref.id} was updated. Saving data to Algolia`)
  return index.saveObject(afterData);
}