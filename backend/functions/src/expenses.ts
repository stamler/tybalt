import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// onWrite()
// check if the filepath changed
// if it did, either a new one was uploaded or 
// there isn't one so delete the old file
export async function cleanUpOrphanedAttachment(
  change: functions.ChangeJson,
  context: functions.EventContext,
) {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    let beforeAttachment: string;
    let afterAttachment: string;

    if (beforeData) {
      // the Expense was updated or deleted
      beforeAttachment = beforeData.attachment;
      afterAttachment = afterData?.attachment ?? null;
      if (beforeAttachment !== afterAttachment) {
        // the attachment was changed so
        // delete the old attachment if it existed
        const bucket = admin.storage().bucket();
        if (beforeAttachment !== undefined) {
          const file = bucket.file(beforeAttachment);
          return file.delete();
        }
      }
      // No change was made to the attachment, do nothing
      return;
    }
    // document was just created, do nothing
    return;
}