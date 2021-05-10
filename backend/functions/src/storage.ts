import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { isDocIdObject, isPayPeriodEndingObject, createPersistentDownloadUrl, getAuthObject, getTrackingDoc } from "./utilities";
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
    
    let trackingSnapshot: admin.firestore.DocumentSnapshot;
    let expensesSnapshot: admin.firestore.QuerySnapshot;
    let zipFilename: string;
    let destination: string;

    // Validate the data or throw with User Defined Type Guards
    // If data is a doc Id object, continue as for ExpenseTracking. If it's a
    // payrollWeekEnding, get the expenses that belong to that payPeriodEnding
    // Throw if neither are true
    if (isDocIdObject(data)) {
      // Get the Expense tracking document
      trackingSnapshot = await db
        .collection("ExpenseTracking")
        .doc(data.id)
        .get();

      // get committed Expense documents with attachments for the week
      expensesSnapshot = await db
        .collection("Expenses")
        .where("approved", "==", true)
        .where("committed", "==", true)
        .where("committedWeekEnding", "==", trackingSnapshot.get("weekEnding"))
        .orderBy("attachment") // only docs where attachment exists
        .get();

      zipFilename = `attachments${trackingSnapshot
        .get("weekEnding")
        .toDate()
        .getTime()}.zip`;
    
      destination = "ExpenseTrackingExports/" + zipFilename;

      functions.logger.info(`generating ExpenseTracking attachment bundle for ${data.id}`);
    } else if (isPayPeriodEndingObject(data)) {
      // Get the Payroll tracking document
      const trackingDocRef = await getTrackingDoc(new Date(data.payPeriodEnding), "PayrollTracking", "payPeriodEnding");
      trackingSnapshot = await trackingDocRef.get();

      // get committed Expense documents with attachments for the pay period
      expensesSnapshot = await db
        .collection("Expenses")
        .where("approved", "==", true)
        .where("committed", "==", true)
        .where("payPeriodEnding", "==", trackingSnapshot.get("payPeriodEnding"))
        .orderBy("attachment") // only docs where attachment exists
        .get();
    
      zipFilename = `attachmentsPayroll${trackingSnapshot
        .get("payPeriodEnding")
        .toDate()
        .getTime()}.zip`;
  
      destination = "PayrollExpenseExports/" + zipFilename;

      functions.logger.info(`generating PayrollTracking attachment bundle for ${new Date(data.payPeriodEnding)}`);
    } else {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "The provided data doesn't contain a document id or payPeriodEnding"
      );
    }

    // define the bucket containing the attachments
    const bucket = admin.storage().bucket();

    // create an empty archive in the working directory
    const tempLocalFileName = path.join(os.tmpdir(), zipFilename);
    const zipfile = fs.createWriteStream(tempLocalFileName);

    // listen for all archive data to be written
    // 'close' event is fired only when a file descriptor is involved
    zipfile.on("close", function() {
      functions.logger.log(archive.pointer() + " total bytes");

      // upload the zip file
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
    functions.logger.log("initialized archiver");
    

    // good practice to catch warnings (ie stat failures and other non-blocking errors)
    archive.on('warning', function(err) {
      if (err.code === 'ENOENT') {
        functions.logger.log(`archiver error: ${err}`);
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
    functions.logger.log(`configured archiver to pipe to ${tempLocalFileName}`);
    

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
    functions.logger.log(contents);
    contents.forEach((file) => {
        archive.append(fs.createReadStream(file.tempLocalAttachmentName), { name: file.filename});
        functions.logger.log(`${file.filename} appended to zip file`);
    });

    // close the archive which will trigger the "close" event handler
    functions.logger.log("calling finalize");
    await archive.finalize();
  }

export async function cleanUpUnusedAttachments(data: unknown, context: functions.https.CallableContext) {
  const auth = getAuthObject(context, ["time"]);

  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  // files = get list of file objects under Expenses/auth.uid/<filenames>
  const [files] = await bucket.getFiles({ prefix: `Expenses/${auth.uid}/` });

  // references = get all Expenses where uid = auth.uid orderBy attachment
  const expensesSnapshot = await db.collection("Expenses")
    .where("uid", "==", auth.uid)
    .orderBy("attachment")
    .get();
  const references = expensesSnapshot.docs.map(x => x.get("attachment"));

  // unreferenced = files where references does not include the file name
  const unreferenced = files.filter(x => !references.includes(x.name));

  // delete unreferenced here (temporarily do nothing for testing)
  functions.logger.info(`deleting ${unreferenced.length} unreferenced files...\n${unreferenced.map(x => x.name).join("\n")}`);
  const deleteResults = [];
  for (const file of unreferenced) {
    deleteResults.push(file.delete());
  }
  const result = await Promise.all(deleteResults);
  functions.logger.info(result);
  return
};