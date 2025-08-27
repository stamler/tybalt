import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as path from "path";
import * as _ from "lodash";
import { zonedTimeToUtc, utcToZonedTime } from "date-fns-tz";
import { differenceInCalendarDays, addDays, subDays, subMilliseconds, addMilliseconds } from "date-fns";
import { PAYROLL_EPOCH, APP_NATIVE_TZ } from "./config";
import { ChangeJson } from "firebase-functions/lib/common/change";

const EXACT_TIME_SEARCH = false; // WAS true, but turned to false because firestore suddently stopped matching "==" Javascript Date Objects
const WITHIN_MSEC = 1;

// This is the type of the data object that is passed to the chatEndpoint
interface ChatPayload {
  content: string;
};

// The auth property of functions.https.CallableContext
export interface AuthObject {
  uid: string;
  token: admin.auth.DecodedIdToken;
}

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
export function getAuthObject(context: functions.https.CallableContext, authorizedClaims: string[]): AuthObject {
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

export function requestHasValidSecret(req: functions.https.Request, secret: string): boolean {
  const appSecret = _.get(functions.config().tybalt, secret);
  if (appSecret !== undefined) {
    const authHeader = req.get("Authorization");

    let reqSecret = null;
    if (authHeader !== undefined) {
      reqSecret = authHeader.replace("TYBALT ", "").trim();
    }
    if (reqSecret === appSecret) {
      return true;
    }
  }
  return false;
}

// Dates are not supported in Firebase Functions yet so
// data.weekEnding is the getTime() a Date object
// https://github.com/firebase/firebase-functions/issues/316
export interface WeekReference {
  // milliseconds since the epoch
  weekEnding: number;
}

// User-defined Type Guard
// https://www.typescriptlang.org/docs/handbook/advanced-types.html#user-defined-type-guards
export function isWeekReference(data: any): data is WeekReference {
  if (data.weekEnding !== undefined) {
    return typeof data.weekEnding === "number";
  }
  return false;
}

export type TimeOffTypes = "OB" | "OH" | "OP" | "OS" | "OV";

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

interface LocationStringObject {
  // a string representing a location
  location: string;
}
export function isLocationStringObject(data: any): data is LocationStringObject {
  return typeof data.location === "string";
}

interface VacationObject {
  // integer result of start.toDate().getTime()
  start: number;
  end: number;
  description: string;
  availability: string;
}

export function isVacationObject(data: any): data is VacationObject {
  return typeof data.start === "number" && 
    typeof data.end === "number" &&
    typeof data.description === "string" &&
    typeof data.availability === "string";
}

// https://www.qualdesk.com/blog/2021/type-guard-for-string-union-types-typescript/
const ALLOWED_INVOICE_LINE_TYPES = ["subcontractor", "expense", "division"] as const;
type InvoiceLineItemType = typeof ALLOWED_INVOICE_LINE_TYPES[number];
function isInvoiceLineItemType(lineType: string): lineType is InvoiceLineItemType {
  return ALLOWED_INVOICE_LINE_TYPES.includes(lineType as InvoiceLineItemType);
}

export interface InvoiceLineObject {
  lineType: InvoiceLineItemType;
  description: string;
  amount: number;
}

function isInvoiceLineObject(data: any): data is InvoiceLineObject {
  // check that amount is a number
  if (typeof data.amount !== "number") {
    return false;
  }

  // check that amount is not zero
  if (data.amount === 0) {
    return false;
  }

  // check that amount has no more than 2 decimal places
  const amount = data.amount.toString().split(".");
  if (amount.length === 2 && amount[1].length > 2) {
    return false;
  }
  // check the types of the properties
  return isInvoiceLineItemType(data.lineType) && typeof data.description === "string" && data.description.length > 0;
}

interface DivisionAmountObject extends InvoiceLineObject {
  // a DivisionAmountObject is an InvoiceLineObject with a lineType of "division"
  lineType: "division";
}

function isDivisionAmountObject(data: any): data is DivisionAmountObject {
  // TODO: check if the division exists in the database
  return isInvoiceLineObject(data) && data.lineType === "division";
}

interface InvoiceObject {
  // integer result of date.toDate().getTime()
  job: string,
  number: string,
  billingNumber: number, // a positive integer greater than zero. The sequence number of the invoice for this job
  revisionNumber: number, // defaults to zero if no revisions. A positive integer
  date: number;
  lineItems: InvoiceLineObject[];
}

export function isInvoiceObject(data: any): data is InvoiceObject {
  // it must contain a job property which is a string
  // The string must match the format XX-YYY WHERE X and Y are numbers
  // TODO: match hyphenated job numbers
  if (typeof data.job !== "string" && !data.job.match(/^\d{2}-\d{3}$/)) {
    return false;
  }

  // it must contain a number property which is a string. Note that even though
  // it is called number it may have hyphens or other characters. The format of
  // the number string must be YYMMNNNN where YY are the last two digits of the
  // year, MM are the month from 01 to 12, and NNNN are a number starting at 0001 and going
  // up. This last number can be either 3 or 4 digits long.
  const numberFormatRegex = /^\d{2}(0[1-9]|1[0-2])(\d{3}|\d{4})$/;
  if (!(typeof data.number === "string" && data.number.match(numberFormatRegex))) {
    return false;
  }

  // it must contain a billingNumber property which is a positive whole number
  if (!(typeof data.billingNumber === "number" && data.billingNumber > 0 && Number.isInteger(data.billingNumber))) {
    return false;
  }

  // it must contain a revisionNumber property which is a positive whole number
  if (!(typeof data.revisionNumber === "number" && data.revisionNumber >= 0 && Number.isInteger(data.revisionNumber))) {
    return false;
  }

  // it must contain a date property which is a number due to serialization
  if (typeof data.date !== "number") {
    return false;
  }

  // it must contain a lineItems property which is an array of objects with a
  // length of at least 1
  if (!(Array.isArray(data.lineItems) && data.lineItems.length > 0)) {
    return false;
  }

  // at least one element of the lineItems array must be a DivisionAmountObject
  // and there must be no duplicated descriptions in all of the
  // DivisionAmountObjects present in the lineItems array
  const lineItems = data.lineItems as InvoiceLineObject[];
  const divisionSet = new Set();
  const otherLineSet = new Set();
  let divisionCount = 0;

  // iterate over the lineItems array adding each description to either
  // divisionSet or otherLineSet based on whether it is a DivisionAmountObject
  // or not. If it is a DivisionAmountObject, increment divisionCount. If the
  // same description is added twice in either set, return false
  for (const lineItem of lineItems) {
    if (!isInvoiceLineObject(lineItem)) {
      return false;
    }
    if (isDivisionAmountObject(lineItem)) {
      if (divisionSet.has(lineItem.description)) {
        return false;
      }
      divisionSet.add(lineItem.description);
      divisionCount++;
    } else {
      if (otherLineSet.has(lineItem.description)) {
        return false;
      }
      otherLineSet.add(lineItem.description);
    }
  }

  // if the divisionCount is less than 1, return false
  if (divisionCount < 1) {
    return false;
  }
  
  return true;
}

interface PayPeriodEndingObject {
  // integer result of payPeriodEnding.toDate().getTime()
  payPeriodEnding: number;
}
export function isPayPeriodEndingObject(data: any): data is PayPeriodEndingObject {
  return typeof data.payPeriodEnding === "number" && isPayrollWeek2(new Date(data.payPeriodEnding));
}

export function createPersistentDownloadUrl(bucket: string, pathToFile: string, downloadToken: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(
    pathToFile
  )}?alt=media&token=${downloadToken}`;
};

// This is a superset of the interface in types.ts in the frontend
export interface TimeSheet {
  // required properties always
  uid: string;
  displayName: string;
  surname: string;
  givenName: string;
  managerUid: string;
  bankedHours: number;
  mealsHoursTally: number;
  divisionsTally: { [x: string]: string };
  jobsTally: {
    [job: string]: {
      description: string;
      client: string;
      hours: number;
      jobHours: number;
      manager?: string;
      proposal?: string;
      status?: string;
      clientContact?: string;
    };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entries: any[];

  submitted: boolean;
  approved: boolean;
  locked: boolean;
  // others to be filled in later
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [x: string]: any;
}
export interface SubmittedTimeSheet extends TimeSheet {
  submitted: true;
  approved: false;
  locked: false;
}
export interface ApprovedTimeSheet extends TimeSheet {
  submitted: true;
  approved: true;
  locked: false;
}
export interface LockedTimeSheet extends TimeSheet {
  submitted: true;
  approved: true;
  locked: true;
}

// Type Guards
export function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}
export function isTimeSheet(data: unknown): data is TimeSheet {
  if (!isObject(data)) {
    return false;
  }
  // check boolean properties exist and have correct type
  const boolVals = ["submitted", "approved", "locked"]
    .map((x) => data[x] !== undefined && typeof data[x] === "boolean")
    .every((x) => x === true);
  // check optional string properties have correct type
  const optionalStringVals = ["surname", "givenName"]
    .map((x) => data[x] === undefined || typeof data[x] === "string")
    .every((x) => x === true);
  // check string properties exist and have correct type
  const stringVals = ["uid", "displayName", "managerUid"]
    .map((x) => data[x] !== undefined && typeof data[x] === "string")
    .every((x) => x === true);
  // check number properties exist and have correct type
  const numVals = ["bankedHours", "mealsHoursTally"]
    .map((x) => data[x] !== undefined && typeof data[x] === "number")
    .every((x) => x === true);
  // check the divisions tally, return false on first type mismatch
  if (!isObject(data.divisionsTally)) {
    return false;
  }
  for (const key in data.divisionsTally) {
    if (typeof key !== "string") {
      return false;
    }
    if (typeof data.divisionsTally[key] !== "string") {
      return false;
    }
  }
  // check the jobs tally, return false on first type mismatch of key
  // TODO: implement checking value
  if (!isObject(data.jobsTally)) {
    return false;
  }
  for (const key in data.jobsTally) {
    if (typeof key !== "string") {
      return false;
    }
  }
  return boolVals && optionalStringVals && stringVals && numVals;
}
export function isSubmittedTimeSheet(data: unknown): data is SubmittedTimeSheet {
  return isTimeSheet(data) && data.submitted === true && data.approved === false && data.locked === false;
}
export function isApprovedTimeSheet(data: unknown): data is ApprovedTimeSheet {
  return isTimeSheet(data) && data.submitted === true && data.approved === true && data.locked === false;
}
export function isLockedTimeSheet(data: unknown): data is LockedTimeSheet {
  return isTimeSheet(data) && data.submitted === true && data.approved === true && data.locked === true;
}

// This TypeGuard checks if the data object is a ChatPayload object
export function isChatPayloadObject(data: unknown): data is ChatPayload {
  if (!isObject(data)) {
    return false;
  }
  return (
    typeof data.content === "string" &&
    data.content.length > 0
  );
}

// If a file object's metadata changes, ensure that the links to it
// inside corresponding TimeTracking or ExpenseTracking doc are updated so that
// downloads continue to work. This allows us to update the token in
// the firebase console for security reasons without breaking the app
// https://www.sentinelstand.com/article/guide-to-firebase-storage-download-urls-tokens
export const writeFileLinks = functions.storage
  .object()
  .onMetadataUpdate(async (objMeta: functions.storage.ObjectMetadata) => {

    // The object name is milliseconds since epoch UTC of weekEnding
    // derrive the weekEnding from it.
    if (typeof objMeta.name !== "string" || objMeta.metadata === undefined) {
      throw new Error("The object metadata is missing information");
    }
    const parsed = path.parse(objMeta.name);

    // attachments and json are stored under in the same prefix to remove
    // the attachments word from beginning if it's there
    let weekEnding
    if (parsed.name.startsWith("attachments")) {
      weekEnding = new Date(Number(parsed.name.substring(11)));
    } else {
      weekEnding = new Date(Number(parsed.name));
    }

    // set the collection based on the last prefix on the directory path,
    // stripping out the "Exports" substring at the end. so for example
    // /Dir/TimeTrackingExports -> TimeTracking
    // /Dir/ExpenseTrackingExports -> ExpenseTracking
    const dirPieces = parsed.dir.split("/");
    const candidate = dirPieces[dirPieces.length - 1];
    const collection = candidate.substring(0, candidate.indexOf("Exports"));

    if (isNaN(weekEnding.getTime())) {
      const message = `filename ${parsed.name} cannot be converted to a date object`;
      functions.logger.error(message);
      throw new Error(message);
    }

    const trackingDocRef = await getTrackingDoc(weekEnding,collection,"weekEnding");

    return trackingDocRef.update({
      [parsed.ext.substring(1)]: createPersistentDownloadUrl(
        admin.storage().bucket().name,
        objMeta.name,
        objMeta.metadata.firebaseStorageDownloadTokens
      ),
    });
  });
// add timestamp of 23:59:59 EST next saturday to weekEndingProperty of Document
// based on dateProperty
export async function writeWeekEnding(
  change: ChangeJson,
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
    // (in APP_NATIVE_TZ timezone)
    const calculatedSaturday = nextSaturday(date);

    // update the Document only if required
    if (
      weekEnding === null ||
        weekEnding.getTime() !== calculatedSaturday.getTime()
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

// Write the payPeriodEnding on Expenses
// add timestamp of pay period ending (23:59:59.999 EST on saturday of week2) 
// to payPeriodEnding of Document based on date and commitTime
export const expensesPayPeriodEnding = functions.firestore
  .document("Expenses/{expenseId}")
  .onWrite(async (
    change: ChangeJson,
    context: functions.EventContext,
  ) => {
    if (!change.after.exists) {
    // The Document was deleted, do nothing
      console.log("writePayPeriodEnding() called but Document was deleted");
      return null;
    }
    const afterData = change.after.data();
    if (afterData === undefined) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `Cannot read Document with id ${change.after.id} during writePayPeriodEnding()`
      )
    }
    const date = afterData.date?.toDate();
    if (date === undefined) {
      console.log(
        `unable to read property date for Document with id ${change.after.id}`
      );
      return null;
    }
    const committedWeekEnding = afterData.committedWeekEnding?.toDate();
    if (committedWeekEnding === undefined) {
      console.log(
        `unable to read property committedWeekEnding for Document with id ${change.after.id}`
      );
      return null;
    }

    // If payPeriodEnding is defined on the Document, get it, otherwise set null
    const payPeriodEnding = afterData.payPeriodEnding?.toDate();

    // Calculate the correct payPeriodEnding based on commitTime AND date
    // (in APP_NATIVE_TZ timezone)
    let calculatedPayPeriodEnding
    if (isPayrollWeek2(committedWeekEnding)) {
      calculatedPayPeriodEnding = committedWeekEnding;
    } else {
    // committedWeekEnding is week1 of this pay period
    // if the expense date is before the end of the last pay period set 
    // calculatedPayPeriodEnding to the previous one
      const lastPayPeriodEnding = thisTimeLastWeekInTimeZone(committedWeekEnding, APP_NATIVE_TZ);
      if (date.getTime() <= lastPayPeriodEnding ) {
        calculatedPayPeriodEnding = lastPayPeriodEnding;
      } else {
      // the date is after the end of the last pay period
        calculatedPayPeriodEnding = thisTimeNextWeekInTimeZone(committedWeekEnding, APP_NATIVE_TZ);
      }
    }
  
    // update the Document only if required
    if (
      payPeriodEnding === undefined ||
    payPeriodEnding.getTime() !== calculatedPayPeriodEnding.getTime()
    ) {
      return change.after.ref.set(
        { payPeriodEnding: calculatedPayPeriodEnding },
        { merge: true }
      );
    }
    // no changes to be made
    return null;
  });

// Calculate the correct saturday of the weekEnding in APP_NATIVE_TZ 
// assuming input is in APP_NATIVE_TZ timezone as well.
export function nextSaturday(date: Date): Date {
  let calculatedSaturday;
  const zonedTime = utcToZonedTime(date, APP_NATIVE_TZ); 
  if (zonedTime.getDay() === 6) {
    calculatedSaturday = zonedTimeToUtc(
      new Date(
        zonedTime.getFullYear(),
        zonedTime.getMonth(),
        zonedTime.getDate(),
        23,
        59,
        59,
        999
      ),
      APP_NATIVE_TZ
    );
  } else {
    const nextsat = new Date(zonedTime.getTime());
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
      APP_NATIVE_TZ
    );
  }
  return calculatedSaturday;
}

// Given a number (result of getTime() from js Date object), verify that it is
// 23:59:59 in APP_NATIVE_TZ on a saturday and that the saturday is a week 2 of
// a payroll at this organization. The definition of this is an integer multiple
// of 14 days after PAYROLL_EPOCH. NB: THIS FUNCTION ALSO IN
// FRONTEND helpers.ts
export function isPayrollWeek2(weekEnding: Date): boolean {
  // There will not be integer days if epoch and weekEnding are in different
  // time zones (EDT vs EST). Convert them both to the same timezone prior
  // to calculating the difference
  const zonedEpoch = utcToZonedTime(PAYROLL_EPOCH, APP_NATIVE_TZ);
  const zonedWeekEnding = utcToZonedTime(weekEnding, APP_NATIVE_TZ);
  const difference = differenceInCalendarDays(zonedWeekEnding, zonedEpoch);
  
  // confirm the time of weekEnding is 23:59:59.999 in APP_NATIVE_TZ
  const isLastMillisecondOfDay = zonedWeekEnding.getHours() === 23 && zonedWeekEnding.getMinutes() === 59 && zonedWeekEnding.getSeconds() === 59 && zonedWeekEnding.getMilliseconds() === 999;
  const isSaturday = zonedWeekEnding.getDay() === 6;

  // confirm difference in calendar days from the epoch modulo 14 is 0
  return difference % 14 === 0 && isLastMillisecondOfDay && isSaturday ? true : false;
}

export function getPayPeriodFromWeekEnding(weekEnding: Date): Date {
  if (isPayrollWeek2(weekEnding)) {
    return weekEnding;
  }

  // check if the weekEnding is a week1 ending by adding 7 days
  // and checking if there result is a week2 ending. If it is
  // return the result, otherwise throw because the weekEnding
  // isn't valid
  const week2candidate = thisTimeNextWeekInTimeZone(weekEnding, APP_NATIVE_TZ);
  if (isPayrollWeek2(week2candidate)) {
    return week2candidate;
  }
  throw new Error("The provided weekEnding isn't valid and cannot be used to getPayPeriodFromWeekEnding");
}

// return the same time 7 days ago in the given time zone
export function thisTimeLastWeekInTimeZone(datetime: Date, timezone: string) {
  const zone_time = utcToZonedTime(datetime, timezone);
  return zonedTimeToUtc(subDays(zone_time, 7), timezone);
}

// return the same time 7 days ago in the given time zone
export function thisTimeNextWeekInTimeZone(datetime: Date, timezone: string) {
  const zone_time = utcToZonedTime(datetime, timezone);
  return zonedTimeToUtc(addDays(zone_time, 7), timezone);
}

export async function getTrackingDoc(date: Date, collection: string, property: string, otherProps = {}) {

  // otherProps, an object containing property names and default values
  // if a new Tracking Document is created
  // example: {expenses: {}} for an ExpenseTracking document
  // TODO: remove dependencies on default properties in other code

  if (!isPayrollWeek2(date)) {
    if (!isPayrollWeek2(thisTimeNextWeekInTimeZone(date,APP_NATIVE_TZ))) {
      throw new Error("The provided date is not a valid week ending");
    }
  }

  const db = admin.firestore();

  // Get the Tracking doc if it exists, otherwise create it.
  let querySnap;
  if (EXACT_TIME_SEARCH) {
    querySnap = await db
      .collection(collection)
      .where(property, "==", date)
      .get();
  } else {
    querySnap = await db
      .collection(collection)
      .where(property, ">", subMilliseconds(date, WITHIN_MSEC))
      .where(property, "<", addMilliseconds(date, WITHIN_MSEC))
      .get();
  }

  let trackingDocRef;
  if (querySnap.size > 1) {
    throw new Error(
      `There is more than one document in ${collection} for ${property} ${date}`
    );
  } else if (querySnap.size === 1) {
    // retrieve existing tracking document
    trackingDocRef = querySnap.docs[0].ref;
  } else {
    // create new tracking document
    trackingDocRef = db.collection(collection).doc();
    functions.logger.info(`creating new ${collection} document ${trackingDocRef.id}`);
    await trackingDocRef.set({
      [property]: date,
      created: admin.firestore.FieldValue.serverTimestamp(),
      ...otherProps,
    });
  }
  return trackingDocRef;
}