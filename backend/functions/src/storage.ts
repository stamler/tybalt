import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { isDocIdObject, createPersistentDownloadUrl } from "./utilities";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as archiver from "archiver";
import { format } from "date-fns";

// Given an ExpenseTracking id, create a zip archive of all attachments
// from Google storage for the corresponding week
// with the committed expenses. Store zip under ExpenseTrackingExports prefix
export async function generateExpenseAttachmentArchive(data: unknown) {
    const db = admin.firestore();
    
    // Validate the data or throw
    // use a User Defined Type Guard
    if (!isDocIdObject(data)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "The provided data doesn't contain a document id"
      );
    }

    console.log(`generating attachment bundle for ${data.id}`);

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
    const zipFilename = `attachments${trackingSnapshot
      .get("weekEnding")
      .toDate()
      .getTime()}.zip`;
    const tempLocalFileName = path.join(os.tmpdir(), zipFilename);

    const zipfile = fs.createWriteStream(tempLocalFileName);

    // listen for all archive data to be written
    // 'close' event is fired only when a file descriptor is involved
    zipfile.on("close", function() {
      console.log(archive.pointer() + " total bytes");

      // upload the zip file
      const destination = "ExpenseTrackingExports/" + zipFilename;
      const newToken = uuidv4();

      // upload the file into the current firebase project default bucket
      return bucket
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
        });
    });

    // initialize the archiver
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Sets the compression level.
    });
    console.log("initialized archiver");
    

    // good practice to catch warnings (ie stat failures and other non-blocking errors)
    archive.on('warning', function(err) {
      if (err.code === 'ENOENT') {
        console.log(`archiver error: ${err}`);
      } else {
        throw err;
      }
    });

    // good practice to catch this error explicitly
    archive.on('error', (err) => {
      throw err;
    });

    // pipe archive data to the file
    archive.pipe(zipfile);
    console.log(`configured archiver to pipe to ${tempLocalFileName}`);
    

    // iterate over the documents with attachments, adding their
    // contents to the zip file with descriptive names
    const contents: { filename: string, tempLocalAttachmentName: string }[] = [];
    const downloadPromises: Promise<any>[] = [];
    await expensesSnapshot.forEach( (expenseDoc) => {
      // download the attachment to the working directory
      const attachment = expenseDoc.get("attachment");
      const filename = `${expenseDoc.get("paymentType")}-${expenseDoc.get("surname")},${expenseDoc.get("givenName")}-${format(expenseDoc.get("date").toDate(), "yyyy_MMM_dd")}-${expenseDoc.get("total")}${path.extname(attachment)}`;
      const tempLocalAttachmentName = path.join(os.tmpdir(), filename);
      downloadPromises.push(bucket.file(attachment).download({destination: tempLocalAttachmentName}))
      contents.push({filename, tempLocalAttachmentName});
    });

    await Promise.all(downloadPromises);
    console.log(contents);
    contents.forEach((file) => {
        archive.append(fs.createReadStream(file.tempLocalAttachmentName), { name: file.filename});
        console.log(`${file.filename} appended to zip file`);
    });

    // close the archive which will trigger the "close" event handler
    console.log("calling finalize");
    await archive.finalize();
  }

