import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { getAuthObject, isDocIdObject, createPersistentDownloadUrl } from "./utilities";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as archiver from "archiver";

// Given an ExpenseTracking id, create a zip archive of all attachments
// from Google storage for the corresponding week
// with the committed expenses. Store zip under ExpenseTrackingExports prefix
export async function generateExpenseAttachmentArchive(
    data: unknown, 
    context: functions.https.CallableContext
  ) {
    const db = admin.firestore();

    // throw if the caller isn't authorized
    const auth = getAuthObject(context, ["report"]);
    
    // Validate the data or throw
    // use a User Defined Type Guard
    if (!isDocIdObject(data)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "The provided data doesn't contain a document id"
      );
    }

    console.log(`${auth.uid} requested attachment bundle generation for ${data.id}`);

    // Get the Expense tracking document
    const trackingSnapshot = await db
      .collection("ExpenseTracking")
      .doc(data.id)
      .get();

    // get committed Expense documents with attachments for the week
    const expensesSnapshot = await db
      .collection("Expenses")
      .where("approved", "==", true)
      .where("committed", "==", true)
      .where("committedWeekEnding", "==", trackingSnapshot.get("weekEnding"))
      .orderBy("attachment") // only docs where attachment exists
      .get();

    // define the bucket containing the attachments
    const bucket = admin.storage().bucket();

    // create an empty archive in the working directory
    const filename = `ExpenseAttachments${trackingSnapshot
      .get("weekEnding")
      .toDate()
      .getTime()}.zip`;
    const tempLocalFileName = path.join(os.tmpdir(), filename);

    const zipfile = fs.createWriteStream(tempLocalFileName);

    // listen for all archive data to be written
    // 'close' event is fired only when a file descriptor is involved
    zipfile.on("close", function() {
      console.log(archive.pointer() + " total bytes");
      console.log("archiver has been finalized and the output file descriptor has closed.");
      console.log("returning zip file to caller");
    });

    // initialize the archiver
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Sets the compression level.
    });

    // good practice to catch warnings (ie stat failures and other non-blocking errors)
    archive.on('warning', function(err) {
      if (err.code === 'ENOENT') {
        console.log(`archiver error: ${err}`);
        
      } else {
        // throw error
        throw err;
      }
    });

    // good practice to catch this error explicitly
    archive.on('error', function(err) {
      throw err;
    });

    // pipe archive data to the file
    archive.pipe(zipfile);

    return new Promise<void>(async (resolve, reject) => {

      // iterate over the documents with attachments, adding their
      // contents to the zip file with descriptive names
      expensesSnapshot.forEach((expenseDoc) => {
        // get the attachment reference
        // download the attachment to the working directory
        // add the attachment from the working directory to the zip with a name that is descriptive 
      });

      // close the archive which will trigger the "close" event handler
      await archive.finalize();

      // upload the zip file
      const destination = "ExpenseTrackingExports/" + filename;
      const newToken = uuidv4();

      // upload the file into the current firebase project default bucket
      bucket
        .upload(tempLocalFileName, {
          destination,
          // Workaround: firebase console not generating token for files
          // uploaded via Firebase Admin SDK
          // https://github.com/firebase/firebase-admin-node/issues/694
          metadata: {
            metadata: {
              firebaseStorageDownloadTokens: newToken,
            },
          },
        })
        .then(async (uploadResponse) => {
          // put the path to the new file into the TimeTracking document
          await trackingSnapshot.ref.update({
            zip: createPersistentDownloadUrl(
              admin.storage().bucket().name,
              destination,
              newToken
            ),
          });
          return resolve();
        })
        .catch((err) => reject(err));
    });
  }

