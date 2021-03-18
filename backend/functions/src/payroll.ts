import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as _ from "lodash";
import { subDays } from "date-fns";
import { zonedTimeToUtc, utcToZonedTime } from "date-fns-tz";
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

export const updatePayrollFromExpenseTracking = functions.firestore
  .document("ExpenseTracking/{expenseTrackingId}")
  .onWrite(async (change, context) => {
    const afterData = change.after.data();
    if (afterData === undefined) {
      functions.logger.warn(`ExpenseTracking document ${change.after.ref.id} was deleted`);
      return;
    }
    const afterWeekEnding = afterData.weekEnding;
    if (afterWeekEnding === undefined) {
      functions.logger.warn(`property "weekEnding" of ExpenseTracking doc ${change.after.ref.id} has no value.`);
      return;  
    }
    const expenses = afterData.expenses;
    if (expenses === undefined) {
      functions.logger.warn(`property "expenses" of ExpenseTracking doc ${change.after.ref.id} has no value.`);
      return;
    }
    const weekEnding = afterWeekEnding.toDate();
    const payPeriodEnding = getPayPeriodFromWeekEnding(weekEnding);
    const payrollTrackingDocRef = await getPayrollTrackingDoc(payPeriodEnding);

    if (isPayrollWeek2(weekEnding.toDate())) {
      // save all expenses to the PayrollTracking doc week2expenses prop
      return payrollTrackingDocRef.update({ week2expenses: expenses });
    } else {
      // it's week 1 of a pay period. partition the expenses by date and
      // save them into two different payroll docs.

      // Derive the upper bound of the prior pay period, call it week0ending.
      const tbay_week = utcToZonedTime(
        weekEnding.toDate(),
        "America/Thunder_Bay"
      );
      const week0Ending = zonedTimeToUtc(subDays(tbay_week, 7), "America/Thunder_Bay");

      // If the date is > week0ending, store it
      // in week1expenses of payrollTrackingDocRef
      // otherwise, store it in week3expenses property of the previous 
      // chronological payrollTrackingDocRef
      const [week1expenses, week3expenses] = _.partition(expenses, (o) => { o.date.getTime() > week0Ending.getTime() });
      const promises = [];
      promises.push(payrollTrackingDocRef.update({ week1expenses }));

      if (week3expenses.length > 0) {
        // There are week3expenses, get the previous payrollTrackingDocRef
        const previousPayrollTrackingDocRef = await getPayrollTrackingDoc(week0Ending);
        promises.push(previousPayrollTrackingDocRef.update({ week3expenses }));
      }

      return Promise.all(promises);
    }

  });
