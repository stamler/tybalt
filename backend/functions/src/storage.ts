import * as functions from "firebase-functions/v1";
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
//
// NOTE: Uses a temp file + buffer-based GCS IO instead of streaming directly to
// Cloud Storage. This is a workaround for an observed production failure in the
// transitive streaming stack (e.g. duplexify/stream-shift) that may depend on a
// combination of Node runtime and dependency versions.
// https://stackoverflow.com/questions/51563883/can-i-zip-files-in-firebase-storage-via-firebase-cloud-functions
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

    const weekEnding = trackingSnapshot.get("weekEnding");
    if (!weekEnding) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `ExpenseTracking document ${data.id} has no weekEnding property`
      );
    }

    // get committed Expense documents with attachments for the week
    expensesSnapshot = await db
      .collection("Expenses")
      .where("approved", "==", true)
      .where("committed", "==", true)
      .where("committedWeekEnding", "==", weekEnding)
      .orderBy("attachment") // only docs where attachment exists
      .get();

    zipFilename = `attachments${weekEnding.toDate().getTime()}.zip`;
    
    destination = "ExpenseTrackingExports/" + zipFilename;

    functions.logger.info(`generating ExpenseTracking attachment bundle for ${data.id}`);
  } else if (isPayPeriodEndingObject(data)) {
    // Get the Payroll tracking document
    const trackingDocRef = await getTrackingDoc(new Date(data.payPeriodEnding), "PayrollTracking", "payPeriodEnding");
    trackingSnapshot = await trackingDocRef.get();

    const payPeriodEnding = trackingSnapshot.get("payPeriodEnding");
    if (!payPeriodEnding) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "PayrollTracking document has no payPeriodEnding property"
      );
    }

    // get committed Expense documents with attachments for the pay period
    expensesSnapshot = await db
      .collection("Expenses")
      .where("approved", "==", true)
      .where("committed", "==", true)
      .where("payPeriodEnding", "==", payPeriodEnding)
      .orderBy("attachment") // only docs where attachment exists
      .get();
    
    zipFilename = `attachmentsPayroll${payPeriodEnding.toDate().getTime()}.zip`;
  
    destination = "PayrollExpenseExportsAttachmentCache/" + zipFilename;

    functions.logger.info(`generating PayrollTracking attachment bundle for ${new Date(data.payPeriodEnding)}`);
  } else {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The provided data doesn't contain a document id or payPeriodEnding"
    );
  }

  // If there are no expenses with attachments, skip archive generation
  if (expensesSnapshot.empty) {
    functions.logger.info("No expenses with attachments found, skipping archive generation");
    return;
  }

  // define the bucket containing the attachments
  const bucket = admin.storage().bucket();
  const bucketName = bucket.name;
  
  if (!bucketName) {
    throw new functions.https.HttpsError(
      "internal",
      "Could not determine storage bucket name"
    );
  }

  // Generate a token for the download URL
  const newToken = uuidv4();
  
  // Create temp file path for the zip
  const tempZipPath = path.join(os.tmpdir(), zipFilename);
  const output = fs.createWriteStream(tempZipPath);

  // initialize the archiver
  const archive = archiver("zip", {
    zlib: { level: 9 }, // Sets the compression level.
  });
  functions.logger.log("initialized archiver");

  // Create a promise that resolves when the archive is complete
  const archivePromise = new Promise<void>((resolve, reject) => {
    output.on("close", () => {
      functions.logger.log(archive.pointer() + " total bytes written to temp file");
      resolve();
    });

    output.on("error", (err) => {
      reject(err);
    });

    // good practice to catch warnings (ie stat failures and other non-blocking errors)
    archive.on("warning", function(err) {
      if (err.code === "ENOENT") {
        functions.logger.log(`archiver warning: ${err}`);
      } else {
        reject(err);
      }
    });

    // good practice to catch this error explicitly
    archive.on("error", (err) => {
      reject(err);
    });
  });

  // pipe archive data to the temp file
  archive.pipe(output);
  functions.logger.log("configured archiver to pipe to temp file");
    
  // Build list of attachments to download
  const attachmentsToDownload: { attachment: string, filename: string }[] = [];
  expensesSnapshot.forEach((expenseDoc) => {
    const attachment = expenseDoc.get("attachment");
    
    // Skip documents where attachment is null or undefined
    if (!attachment || typeof attachment !== "string") {
      functions.logger.warn(`Expense ${expenseDoc.id} has invalid attachment value: ${attachment}`);
      return;
    }
    
    const first8 = path.basename(attachment).substring(0, 8);
    const paymentType = expenseDoc.get("paymentType") || "Unknown";
    const surname = expenseDoc.get("surname") || "Unknown";
    const givenName = expenseDoc.get("givenName") || "Unknown";
    const date = expenseDoc.get("date");
    const total = expenseDoc.get("total") || 0;
    
    let dateStr = "Unknown_Date";
    if (date && typeof date.toDate === "function") {
      dateStr = format(date.toDate(), "yyyy_MMM_dd");
    }
    
    const filename = `${paymentType}-${surname},${givenName}-${dateStr}-${total}-${first8}${path.extname(attachment)}`;
    attachmentsToDownload.push({ attachment, filename });
  });

  // If no valid attachments were found after filtering, skip archive generation
  if (attachmentsToDownload.length === 0) {
    functions.logger.info("No valid attachments found after filtering, skipping archive generation");
    return;
  }

  // Download files as buffers (not streams) to avoid issues in the transitive
  // streaming stack (which can vary by Node runtime and dependency versions).
  // file.download() without destination returns [Buffer]
  functions.logger.log(`downloading ${attachmentsToDownload.length} attachments as buffers`);
  const downloadResults = await Promise.all(
    attachmentsToDownload.map(async ({ attachment, filename }) => {
      const [buffer] = await bucket.file(attachment).download();
      return { filename, buffer };
    })
  );
  functions.logger.log(`downloaded ${downloadResults.length} attachments`);

  // Append buffers directly to archive (no streaming)
  downloadResults.forEach(({ filename, buffer }) => {
    archive.append(buffer, { name: filename });
    functions.logger.log(`${filename} appended to zip file`);
  });

  // close the archive which will trigger the "close" event on output
  functions.logger.log("calling finalize");
  await archive.finalize();
  
  // Wait for the archive to be fully written to temp file
  await archivePromise;
  
  // Read the temp file as a buffer and upload using file.save() to avoid
  // streaming operations (which have hit issues in the transitive stream stack).
  functions.logger.log(`reading ${tempZipPath} and uploading to ${destination}`);
  const zipBuffer = fs.readFileSync(tempZipPath);
  await bucket.file(destination).save(zipBuffer, {
    contentType: "application/zip",
    // Custom metadata must be nested under metadata.metadata for Firebase Storage
    // download tokens to work properly
    metadata: {
      metadata: {
        firebaseStorageDownloadTokens: newToken,
      },
    },
  });
  functions.logger.log("upload complete");

  // Update the tracking document with the download URL
  await trackingSnapshot.ref.update({
    zip: createPersistentDownloadUrl(
      bucketName,
      destination,
      newToken
    ),
  });
  functions.logger.log("tracking document updated");

  // Clean up temp zip file
  try {
    fs.unlinkSync(tempZipPath);
    functions.logger.log("temp zip file cleaned up");
  } catch (cleanupError) {
    functions.logger.warn(`Failed to clean up temp zip file: ${cleanupError}`);
  }
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