import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as _ from "lodash";
import { getPayPeriodFromWeekEnding, isPayrollWeek2 } from "./utilities";

async function getPayrollTrackingDoc(payPeriodEnding: Date) {
  const db = admin.firestore();
  if (!isPayrollWeek2(payPeriodEnding)) {
    throw new Error(`${payPeriodEnding} is not a valid pay period ending`);
  }

  // Get the PayrollTracking doc if it exists, otherwise create it.
  const querySnap = await db
    .collection("PayrollTracking")
    .where("payPeriodEnding", "==", payPeriodEnding)
    .get();

  let payrollTrackingDocRef;
  if (querySnap.size > 1) {
    throw new Error(
      `There is more than one document in PayrollTracking for payPeriodEnding ${payPeriodEnding}`
    );
  } else if (querySnap.size === 1) {
    // retrieve existing tracking document
    payrollTrackingDocRef = querySnap.docs[0].ref;
  } else {
    // create new tracking document
    payrollTrackingDocRef = db.collection("PayrollTracking").doc();
    await payrollTrackingDocRef.set({ payPeriodEnding });
  }
  return payrollTrackingDocRef;
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

export const updatePayrollFromExpenses = functions.firestore
  .document("Expenses/{expenseId}")
  .onWrite(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    const payPeriodEnding: Date = afterData?.payPeriodEnding?.toDate() ?? beforeData?.payPeriodEnding?.toDate();

    if (afterData === undefined) {
      throw new Error(`Expenses document ${change.after.ref.id} was deleted. PayrollTracking, ExpenseTracking, and exports may contain inconsistent data.`);
    }
    if (payPeriodEnding === undefined) {
      functions.logger.warn(`property "payPeriodEnding" of Expenses doc ${change.after.ref.id} has no value. Doing nothing.`);
      return;  
    }
    const payrollTrackingDocRef = await getPayrollTrackingDoc(payPeriodEnding);

    if (afterData.committed) {
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
