import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { isDocIdObject, isPayPeriodEndingObject, createPersistentDownloadUrl, getAuthObject, getTrackingDoc } from "./utilities";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as archiver from "archiver";
import { format } from "date-fns";

// Given an ExpenseTracking id in a DocIdObject or a payPeriodEnding, create a
// zip archive of all attachments from Google storage for the corresponding week
// with the committed expenses. Store zip under ExpenseTrackingExports prefix

// TODO: rework without using temp storage and upload
//https://stackoverflow.com/questions/51563883/can-i-zip-files-in-firebase-storage-via-firebase-cloud-functions
export const generateExpenseAttachmentArchive = functions
  .runWith({memory: "2GB", timeoutSeconds: 180})
  .https
  .onCall(generateExpenseAttachmentArchiveUnwrapped)

export async function generateExpenseAttachmentArchiveUnwrapped(data: unknown) {
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
  
    destination = "PayrollExpenseExportsAttachmentCache/" + zipFilename;

    functions.logger.info(`generating PayrollTracking attachment bundle for ${new Date(data.payPeriodEnding)}`);
  } else {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The provided data doesn't contain a document id or payPeriodEnding"
    );
  }

  // define the bucket containing the attachments
  const bucket = admin.storage().bucket();

  // upload the zip file
  const newToken = uuidv4();

  // create the outputStreamBuffer
  const outputStreamBuffer = bucket.file(destination).createWriteStream({
    gzip: true,
    contentType: "application/zip",
    // Workaround: firebase console not generating token for files
    // uploaded via Firebase Admin SDK
    // https://github.com/firebase/firebase-admin-node/issues/694
    metadata: {
      metadata: {
        firebaseStorageDownloadTokens: newToken,
      },
    },
  });

  // initialize the archiver
  const archive = archiver("zip", {
    zlib: { level: 9 }, // Sets the compression level.
  });
  functions.logger.log("initialized archiver");
    
  // listen for all archive data to be written
  // 'close' event is fired only when a file descriptor is involved
  archive.on("finish", async () => {
    functions.logger.log(archive.pointer() + " total bytes");

    // put the path to the new file into the TimeTracking document
    await trackingSnapshot.ref.update({
      zip: createPersistentDownloadUrl(
        admin.storage().bucket().name,
        destination,
        newToken
      ),
    });
  });

  // good practice to catch warnings (ie stat failures and other non-blocking errors)
  archive.on("warning", function(err) {
    if (err.code === "ENOENT") {
      functions.logger.log(`archiver error: ${err}`);
    } else {
      throw err;
    }
  });

  // good practice to catch this error explicitly
  archive.on("error", (err) => {
    throw err;
  });

  // pipe archive data to the file
  archive.pipe(outputStreamBuffer);
  functions.logger.log("configured archiver to pipe to Cloud Storage");
    
  // iterate over the documents with attachments, adding their
  // contents to the zip file with descriptive names
  const contents: { filename: string, tempLocalAttachmentName: string }[] = [];
  const downloadPromises: Promise<any>[] = [];
  await expensesSnapshot.forEach( (expenseDoc) => {
    // download the attachment to the working directory
    const attachment = expenseDoc.get("attachment");
    const first8 = path.basename(attachment).substr(0,8);
    const filename = `${expenseDoc.get("paymentType")}-${expenseDoc.get("surname")},${expenseDoc.get("givenName")}-${format(expenseDoc.get("date").toDate(), "yyyy_MMM_dd")}-${expenseDoc.get("total")}-${first8}${path.extname(attachment)}`;
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

// UI calls this prior to attempting to upload an expense attachment, cleaning
// up the existing attachments in case there are orphans from previous uploads
export const cleanUpUsersExpenseAttachments = functions.https.onCall(async (data: unknown, context: functions.https.CallableContext) => {
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
});

// UI calls this prior to attempting to upload a PurchaseOrderRequest
// attachment, cleaning up the existing attachments in case there are orphans
// from previous uploads
export const cleanUpUsersPurchaseOrderRequestAttachments = functions.https.onCall(async (data: unknown, context: functions.https.CallableContext) => {
  const auth = getAuthObject(context, ["time"]);

  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  // files = get list of file objects under PurchaseOrderRequests/auth.uid/<filenames>
  const [files] = await bucket.getFiles({ prefix: `PurchaseOrderRequests/${auth.uid}/` });

  // references = get all PurchaseOrderRequests where uid = auth.uid orderBy attachment
  const purchaseOrderRequestsSnapshot = await db.collection("PurchaseOrderRequests")
    .where("creatorUid", "==", auth.uid)
    .orderBy("attachment")
    .get();
  const references = purchaseOrderRequestsSnapshot.docs.map(x => x.get("attachment"));
 
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
});