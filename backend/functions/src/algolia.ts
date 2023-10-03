import * as functions from "firebase-functions";
import algoliasearch from "algoliasearch";
import * as _ from "lodash";
import { ChangeJson } from "firebase-functions/lib/common/change";
const env = functions.config();

// This interface defines the named parameters for the updateAlgoliaIndex
// function
interface UpdateAlgoliaIndexParams {
  change: ChangeJson;
  context: functions.EventContext;
  indexName: string;
  allowedFields?: string[];
  filterFunction?: (data: any) => boolean;
  searchKeysFunction?: (data: any) => string[];
}

// update the specified index using the after data in the ChangeJson
// if change.after exists, push the data
// if change.after doesn't exist, delete the objectId
// https://firebase.google.com/docs/firestore/solutions/search#solution_algolia
export async function updateAlgoliaIndex({
  change,
  context,
  indexName,
  allowedFields = undefined,
  filterFunction = undefined,
  searchKeysFunction = undefined,
}: UpdateAlgoliaIndexParams) {

  // setup the Algolia client and index
  const client = algoliasearch(env.algolia.appid, env.algolia.apikey);
  const index = client.initIndex(indexName);
  
  const afterData = change.after?.data();

  // If document was deleted, remove from algolia index
  if (afterData === undefined) {
    functions.logger.log(`Removing item ${change.after.ref.id} from index ${indexName} because it was deleted from collection ${change.after.ref.collection}`);
    return index.deleteObject(change.after.ref.id);
  }
  
  // if the filter function is provided and returns false, then remove the
  // document from the index
  if (filterFunction !== undefined && !filterFunction(change.after)) {
    functions.logger.log(`Removing item ${change.after.ref.id} from index ${indexName} because it was filtered`);
    return index.deleteObject(change.after.ref.id);
  }

  // The document was either created or updated
  // Add an 'objectID' field required by Algolia then save to index
  afterData.objectID = change.after.ref.id;

  // create a searchKeys field from the provided searchKeys function
  // if it exists. This function is expected to return an array of strings
  // when provided with a data object. The data object is the afterData
  // object.
  if (searchKeysFunction !== undefined) {
    functions.logger.info(`searchKeys function provided. Creating searchKeys field`);
    afterData.searchKeys = searchKeysFunction(change.after);
  }

  // if allowedFields is provided, then only include those fields in the
  // data that is saved to the index. Use the _.pick from lodash
  if (allowedFields !== undefined) {
    // create a fields array that includes the objectID field and the allowedFields
    const fields = ["objectID", ...allowedFields];
    functions.logger.log(`${change.after.ref.id} was updated. Saving allowedFields to Algolia`)
    return index.saveObject(_.pick(afterData, fields));
  }
  functions.logger.log(`${change.after.ref.id} was updated. Saving all data to Algolia`)
  return index.saveObject(afterData);
}

// This function creates a searchKeys array field from the provided object
// (change.after). This are just keys that can be used to search
export function jobSearchKeys(object: any) {
  return [object.ref.id.replace(/[-P ]/g,""), object.ref.id.replace(/[P]/g,"")];
}

export function profileFilter(object: any) {
  return true;
  // TODO: uncomment this when we have established a way to determine if a
  // profile is active or not 
  //return object.timeSheetExpected === true;
}

export function divisionsFilter(object: any) {
  return object.ref.id.length > 1;
}