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


/*
  If an expense is committed, add it to the expenses property of the 
  ExpenseTracking document for the corresponding weekEnding.

  If an expense is manually uncommitted, remove it from the expenses property 
  of the ExpenseTracking document for the corresponding weekEnding.
 */
export const updateExpenseTracking = functions.firestore
  .document("Expenses/{expenseId}")
  .onWrite(async (change, context) => {
    const db = admin.firestore();
    const beforeData = change.before.data();
    const afterData = change.after.data();
    const beforeCommitted: boolean = beforeData?.committed ?? false;
    const weekEnding: Date = beforeData?.committedWeekEnding?.toDate() ?? afterData?.committedWeekEnding?.toDate();
    if ( weekEnding === undefined ) {
      console.log(`failed to get weekEnding, terminating`);
      return;      
    }

    // Get the ExpenseTracking doc if it exists, otherwise create it.
    const querySnap = await db
      .collection("ExpenseTracking")
      .where("weekEnding", "==", weekEnding)
      .get();

    let expenseTrackingDocRef;
    if (querySnap.size > 1) {
      throw new Error(
        `There is more than one document in ExpenseTracking for weekEnding ${weekEnding}`
      );
    } else if (querySnap.size === 1) {
      // retrieve existing ExpenseTracking document
      expenseTrackingDocRef = querySnap.docs[0].ref;
    } else {
      // create new ExpenseTracking document
      expenseTrackingDocRef = db.collection("ExpenseTracking").doc();
      await expenseTrackingDocRef.set({ weekEnding });
    }
    if (
      afterData &&
      afterData.committed === true &&
      afterData.approved === true
    ) {
      // add the committed Expense to expenses
      return expenseTrackingDocRef.update(
        {
          [`expenses.${change.after.ref.id}`]: { displayName: afterData.displayName, uid: afterData.uid },
        }
      );
    }
    if (
      afterData &&
      afterData.committed !== beforeCommitted &&
      afterData.committed === false &&
      afterData.approved === true
    ) {
      // remove the *manually* uncommitted Expense from expenses
      console.log(`Expense ${change.after.ref.id} has been manually uncommitted. Export must be run to update the reports`);
      return expenseTrackingDocRef.update(
        {
          [`expenses.${change.after.ref.id}`]: admin.firestore.FieldValue.delete(),
        }
      );
    }
    return;
  });
