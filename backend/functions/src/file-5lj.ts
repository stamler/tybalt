// This function takes three arguments:

//     * collectionName: A string representing the name of the collection to
//       process.
//     * batchFunction: A callback function that takes a batch object and a
//       document object as arguments. The function should apply some write
//       operation to document using the batch object.
//     * hasMoreData: A callback function that takes a querySnapshot object as
//       an argument and returns a boolean value indicating whether there is
//       more data to process in the collection. This is an optional argument,
//       and defaults to a function that returns false, indicating that there is
//       no more data to process.

// The function uses startAt() to continue processing the collection where it
// left off after each batch. It also keeps track of the last successfully
// processed document in the Config document, and if a batch fails to commit it
// logs an error, saves the ID of the start document for that batch in the
// Config document's errors field, and throws an error to terminate the
// function.

// Note that the Config document is initialized with an empty errors field if it
// doesn't already exist.

import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";

interface ApplyProcessState {
  startAt?: any;
  errors: any[];
}

export async function applyFunctionToFirestoreCollection(
  collectionName: string,
  batchFunction: (batch: FirebaseFirestore.WriteBatch, document: FirebaseFirestore.QueryDocumentSnapshot) => void,
  hasMoreData: (querySnapshot: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>) => boolean = () => false,
) {
  const db = admin.firestore();
  const batchSize = 499;
  const stateDoc = db.collection("Config").doc("collectionBatchProcess");
  const stateSnap = await stateDoc.get();
  const state: ApplyProcessState = stateSnap.exists ? (stateSnap.data() as ApplyProcessState) : { errors: [] };
  let startAt = state.startAt || null;
  let batchCount = 0;
  let successCount = 0;

  functions.logger.info(`Starting batch process at document ${startAt || "start"}`);

  while (true) {
    // https://firebase.google.com/docs/firestore/query-data/order-limit-data 
    // * By default, a query retrieves all documents that satisfy the query in
    //   ascending order by document ID.
    const queryRef = db.collection(collectionName);
    const query = startAt !== null ? queryRef.startAt(startAt) : queryRef;
  
    let querySnap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;

    try {
      querySnap = await query.limit(batchSize).get();
    } catch (error) {
      functions.logger.error(`Failed to fetch data for batch starting at document ${startAt || "one" }.`, error);
      if (startAt !== null) {
        state.errors.push(startAt);
        await stateDoc.set(state, { merge: true });
      }
      throw error;
    }

    if (querySnap.empty) break;

    const batch = db.batch();

    querySnap.docs.forEach((documentSnapshot) => {
      batchFunction(batch, documentSnapshot);
    });

    try {
      await batch.commit();

      successCount += querySnap.docs.length;
      batchCount++;

      console.log(`Processed ${successCount} documents with ${batchCount} batches. Starting from document ${startAt || "start"}.`);

      if (!hasMoreData(querySnap)) break;

      startAt = querySnap.docs[querySnap.docs.length - 1];

      state.startAt = startAt.id;
      state.errors = [];

      await stateDoc.set(state, { merge: true });
    } catch (error) {
      console.error(`Failed to commit batch starting at document ${startAt}.`, error);

      state.errors.push(startAt);

      await stateDoc.set(state, { merge: true });

      throw error;
    }
  }

  console.log(`Batch process complete: processed ${successCount} documents with ${batchCount} batches.`);
}