import * as functions from "firebase-functions/v1";
import * as firestore from "@google-cloud/firestore";

const client = new firestore.v1.FirestoreAdminClient();
const bucket = "gs://tybalt_firestore_exports";

// Backup firestore to the bucket at 11:59pm GMT on Tue, Thu & Sat
export const scheduledFirestoreExport = functions.pubsub
  .schedule("59 23 * * 2,4,6")
  .onRun((context) => {
    const projectId = (process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT) as string;
    const databaseName = client.databasePath(projectId, "(default)");

    return client.exportDocuments({
      name: databaseName,
      outputUriPrefix: bucket,
      collectionIds: [],
    }).then(responses => {
      const response = responses[0];
      console.log(`Operation Name: ${response["name"]}`);
    }).catch(err => {
      console.error(err);
      throw new Error("Export operation failed");
    });
  });
