import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import * as _ from "lodash";
import { getAuthObject, getPayPeriodFromWeekEnding, getTrackingDoc, isDocIdObject, isPayrollWeek2 } from "./utilities";

async function getPayrollTrackingDoc(payPeriodEnding: Date) {
  if (!isPayrollWeek2(payPeriodEnding)) {
    throw new Error(`${payPeriodEnding} is not a valid pay period ending`);
  }
  return getTrackingDoc(payPeriodEnding,"PayrollTracking","payPeriodEnding", { expenses: {} });
}

export const updatePayrollFromTimeTracking = functions.firestore
  .document("TimeTracking/{timeTrackingId}")
  .onWrite(async (change, context) => {
    const afterData = change.after.data();
    if (afterData === undefined) {
      functions.logger.warn(`TimeTracking document ${change.after.ref.id} was deleted`);
      return;
    }
    const afterWeekEnding = afterData.weekEnding;
    if (afterWeekEnding === undefined) {
      functions.logger.warn(`property "weekEnding" of TimeTracking doc ${change.after.ref.id} has no value.`);
      return;  
    }
    const jsonLink = afterData.json;
    if (jsonLink === undefined) {
      functions.logger.warn(`property "json" of TimeTracking doc ${change.after.ref.id} has no value.`);
      return;
    }
    const weekEnding = afterWeekEnding.toDate();
    const payPeriodEnding = getPayPeriodFromWeekEnding(weekEnding);
    const payrollTrackingDocRef = await getPayrollTrackingDoc(payPeriodEnding);

    if (isPayrollWeek2(weekEnding)) {
      return payrollTrackingDocRef.update({ week2TimeJson: jsonLink });
    } else {
      return payrollTrackingDocRef.update({ week1TimeJson: jsonLink });
    }    
  });


// When an expense is added, changed or deleted, update the payroll tracking
// document.
export const updatePayrollFromExpenses = functions.firestore
  .document("Expenses/{expenseId}")
  .onWrite(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    const payPeriodEnding: Date = afterData?.payPeriodEnding?.toDate() ?? beforeData?.payPeriodEnding?.toDate();

    if (afterData === undefined) {
      // The expense was deleted. Throw an error if the expense was already
      // committed alerting that there could be inconsistencies.
      if (beforeData?.committed) {
        throw new Error(`Expenses document ${change.after.ref.id} was deleted. PayrollTracking, ExpenseTracking, and exports may contain inconsistent data.`);
      }
    }
    if (payPeriodEnding === undefined) {
      functions.logger.warn(`property "payPeriodEnding" of Expenses doc ${change.after.ref.id} has no value. Doing nothing.`);
      return;  
    }
    const payrollTrackingDocRef = await getPayrollTrackingDoc(payPeriodEnding);

    if (afterData?.committed) {
    // the expense is committed, add to expenses property of PayrollTracking doc
      return payrollTrackingDocRef.update(
        {
          [`expenses.${change.after.ref.id}`]: { displayName: afterData.displayName, uid: afterData.uid, date: afterData.date, commitTime: afterData.commitTime },
        }
      );  
    } else {
      // the expense isn't committed, remove from PayrollTracking doc
      return payrollTrackingDocRef.update(
        {
          [`expenses.${change.after.ref.id}`]: admin.firestore.FieldValue.delete(),
        }
      );  
    }

    
  });

export const rebuildPayrollTracking = functions.runWith({memory: "1GB", timeoutSeconds: 180}).https.onCall(async (data: unknown, context: functions.https.CallableContext) => {
  getAuthObject(context, ["admin"]);

  if (!isDocIdObject(data)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The provided data isn't a valid document reference"
    );
  }

  const db = admin.firestore();
  const payrollTrackingDoc = await db.collection("PayrollTracking").doc(data.id).get();
  if (!payrollTrackingDoc.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "The PayrollTracking document doesn't exist"
    );
  }

  const payPeriodEnding = payrollTrackingDoc.get("payPeriodEnding");
  if (!payPeriodEnding) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The PayrollTracking document has no payPeriodEnding property"
    );
  }

  const expensesSnapshot = await db
    .collection("Expenses")
    .where("committed", "==", true)
    .where("payPeriodEnding", "==", payPeriodEnding)
    .get();

  const expenses: Record<string, { displayName: unknown; uid: unknown; date: unknown; commitTime: unknown }> = {};
  expensesSnapshot.forEach((doc) => {
    const docData = doc.data();
    expenses[doc.id] = {
      displayName: docData.displayName,
      uid: docData.uid,
      date: docData.date,
      commitTime: docData.commitTime,
    };
  });

  await payrollTrackingDoc.ref.update({ expenses });
  return { count: expensesSnapshot.size };
});
