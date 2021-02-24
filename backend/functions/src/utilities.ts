import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// make a string with serial & manufacturer that uniquely identifies a computer
export function makeSlug(serial: string, mfg: string) {
  const sc = serial.replace(/\s|\/|,/g, "");
  const mc = mfg
    .toLowerCase()
    .replace(/\/|\.|,|inc|ltd/gi, "")
    .trim()
    .replace(/ /g, "_");
  if (sc.length >= 4 && mc.length >= 2) {
    return sc + "," + mc;
  } else {
    throw new Error(`serial ${sc} or manufacturer ${mc} too short`);
  }
};

// throw if at least one authorizedClaim isn't present in the context
export function getAuthObject(context: functions.https.CallableContext, authorizedClaims: string[]): {uid: string, token: admin.auth.DecodedIdToken} {
  if (!context.auth) {
    // Throw an HttpsError so that the client gets the error details
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Caller must be authenticated"
    );
  }
  const auth = context.auth;

  // caller must have at least one authorized custom claim
  if (
    !authorizedClaims.some(
      (claim: string) =>
        Object.prototype.hasOwnProperty.call(auth.token, claim) &&
        auth.token[claim] === true
    )
  ) {
    // Throw an HttpsError so that the client gets the error details
    throw new functions.https.HttpsError(
      "permission-denied",
      `Caller must have one of [${authorizedClaims.toString()}] claims`
    );
  }
  return auth;
}

// Dates are not supported in Firebase Functions yet so
// data.weekEnding is the valueOf() a Date object
// https://github.com/firebase/firebase-functions/issues/316
export interface WeekReference {
  // milliseconds since the epoch
  weekEnding: number;
}

// User-defined Type Guard
// https://www.typescriptlang.org/docs/handbook/advanced-types.html#user-defined-type-guards
export function isWeekReference(data: any): data is WeekReference {
  if (data.weekEnding) {
    return typeof data.weekEnding === "number";
  }
  return false;
}

// these fields need to match the validTimeEntry() function in firestore rules
export interface TimeEntry {
  // required properties always
  date: admin.firestore.Timestamp;
  timetype: string;
  timetypeName: string;
  uid: string;

  // required properties for TimeEntries pulled from collection
  weekEnding: admin.firestore.Timestamp;

  // properties which are never required, but may require eachother
  division?: string;
  divisionName?: string;
  workDescription?: string;
  hours?: number;
  mealsHours?: number;
  client?: string;
  job?: string;
  jobDescription?: string;
  workrecord?: string;
  jobHours?: number;
  payoutRequestAmount?: number;
}

interface DocIdObject {
  // the id of a document
  id: string;
}
export function isDocIdObject(data: any): data is DocIdObject {
  return typeof data.id === "string";
}

// add timestamp of 23:59:59 EST next saturday to weekEndingProperty of Document
// based on dateProperty
export async function writeWeekEnding(
  change: functions.ChangeJson,
  context: functions.EventContext,
  dateProperty: string,
  weekEndingProperty: string
) {
    if (change.after.exists) {
      // The Document was not deleted
      const afterData = change.after.data();
      if (afterData === undefined) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `Cannot read Document with id ${change.after.id} during writeWeekEnding`
        )
      }
      let date;
      try {
        // get the date from the Document
        date = afterData[dateProperty].toDate();
      } catch (error) {
        console.log(
          `unable to read property ${dateProperty} for Document with id ${change.after.id}`
        );
        return null;
      }
      // If weekEnding is defined on the Document, get it, otherwise set null
      const weekEnding = Object.prototype.hasOwnProperty.call(
        afterData,
        weekEndingProperty
      )
        ? afterData[weekEndingProperty].toDate()
        : null;

      // Calculate the correct saturday of the weekEnding
      // (in America/Thunder_Bay timezone)
      let calculatedSaturday;
      if (date.getDay() === 6) {
        // assume the date is already in America/Thunder_Bay Time Zone
        console.log(`writeWeekEnding() ${dateProperty} is already a saturday`);
        calculatedSaturday = zonedTimeToUtc(
          new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            23,
            59,
            59,
            999
          ),
          "America/Thunder_Bay"
        );
      } else {
        console.log("writeWeekEnding() calculating next saturday");
        // assume the date is already in America/Thunder_Bay Time Zone
        const nextsat = new Date(date.valueOf());
        nextsat.setDate(nextsat.getDate() - nextsat.getDay() + 6);
        calculatedSaturday = zonedTimeToUtc(
          new Date(
            nextsat.getFullYear(),
            nextsat.getMonth(),
            nextsat.getDate(),
            23,
            59,
            59,
            999
          ),
          "America/Thunder_Bay"
        );
      }

      // update the Document only if required
      if (
        weekEnding === null ||
        weekEnding.toDateString() !== calculatedSaturday.toDateString
      ) {
        return change.after.ref.set(
          { [weekEndingProperty]: calculatedSaturday },
          { merge: true }
        );
      }

      // no changes to be made
      return null;
    } else {
      // The Document was deleted, do nothing
      console.log("writeWeekEnding() called but Document was deleted");
      return null;
    }
  };
