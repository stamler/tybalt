/* 

This module exports callable handlers (functions.https.onCall(<handler_func>))
https://firebase.google.com/docs/functions/callable


Claims permissions: these should perhaps be in an array and simpler to get
below the 1000 byte limit

time: true 
The default. Holders of this claim can create TimeEntries, bundle and unbundle
their own TimeSheets, and submit them for approval

tapr: true
Holders of this claim can approve submitted timesheets whose 
managerUid field matches their uid.

tadm: true
Holders of this claim can export a time-tracking files for distribution to 
accounting for payroll and to admin for invoicing
*/
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { zonedTimeToUtc, utcToZonedTime } from "date-fns-tz";
import { format, subWeeks } from "date-fns";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getAuthObject } from "./utilities";

// these fields need to match the validTimeEntry() function in firestore rules
interface TimeEntry {
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

// Dates are not supported in Firebase Functions yet so
// data.weekEnding is the valueOf() a Date object
// https://github.com/firebase/firebase-functions/issues/316
interface WeekReference {
  // milliseconds since the epoch
  weekEnding: number;
}

// User-defined Type Guard
// https://www.typescriptlang.org/docs/handbook/advanced-types.html#user-defined-type-guards
function isWeekReference(data: any): data is WeekReference {
  if (data.weekEnding) {
    return typeof data.weekEnding === "number";
  }
  return false;
}

interface DocIdObject {
  // the id of a document
  id: string;
}
function isDocIdObject(data: any): data is DocIdObject {
  return typeof data.id === "string";
}

// The bundleTimesheet groups TimeEntries together
// into a timesheet for a given user and week
// time is ignored in weekEnding property of data arg
export async function bundleTimesheet(
    data: unknown, 
    context: functions.https.CallableContext
  ) {

  const db = admin.firestore();

  // throw if the caller isn't authorized
  const auth = getAuthObject(context, ["time"]);

  // Validate the data or throw
  // use a User Defined Type Guard
  if (!isWeekReference(data)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The provided data isn't a valid week reference"
    );
  }

  // Firestore timestamps and JS Date objects represent a point in time and
  // have no associated time zone info. To determine time zone dependent
  // facts like whether a day is a saturday or to set the time specific to
  // eastern time as desired (for week endings), we must interpret date
  // in a time zone. Hre we rebase time objects to America/Thunder_Bay to
  // do manipulations and validate week days, then we change it back.
  const tbay_week = utcToZonedTime(
    new Date(data.weekEnding),
    "America/Thunder_Bay"
  );

  // Overwrite the time to 23:59:59.999 in America/Thunder_Bay time zone
  tbay_week.setHours(23, 59, 59, 999);

  // verify tbay_week is a Saturday in America/Thunder_Bay time zone
  if (tbay_week.getDay() !== 6) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The week ending specified is not a Saturday"
    );
  }

  // Convert back to UTC for queries against firestore
  const week = zonedTimeToUtc(new Date(tbay_week), "America/Thunder_Bay");

  // Throw if a timesheet already exists for this week
  const timeSheets = await db
    .collection("TimeSheets")
    .where("uid", "==", auth.uid)
    .where("weekEnding", "==", week)
    .get();
  if (!timeSheets.empty) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Only one time sheet can exist for a week. Please edit the existing one."
    );
  }

  // Look for TimeEntries to bundle
  const timeEntries = await db
    .collection("TimeEntries")
    .where("uid", "==", auth.uid)
    .where("weekEnding", "==", week)
    .orderBy("date", "asc")
    .get();
  if (!timeEntries.empty) {
    // Outstanding TimeEntries exist, start the bundling process
    const batch = db.batch();

    // Put the existing timeEntries into an array then delete from Collection
    const entries: TimeEntry[] = [];
    const bankEntries: TimeEntry[] = [];
    const payoutRequests: TimeEntry[] = [];
    const offRotationDates: number[] = [];
    const nonWorkHoursTally: { [timetype: string]: number } = {}; // value is total
    let mealsHoursTally = 0;
    const workHoursTally = { hours: 0, jobHours: 0, noJobNumber: 0 };
    const divisionsTally: { [division: string]: string } = {}; // value is divisionName
    const jobsTally: { [job: string]: { description: string, client: string, hours: number, jobHours: number } } = {};
    timeEntries.forEach((timeEntry) => {
      const item = timeEntry.data() as TimeEntry;
      // TODO: validate timeEntry.data() against TimeEntry type with type guard
      // TODO: build a tree of types and operate on them based on type. This would
      // simplify below code. For example RegularTimeEntry, BankTimeEntry,
      // NonWorkTimeEntry, OffRotationTimeEntry with corresponding type guards

      if (item.timetype === "OR") {
        // Count the off rotation dates and ensure that there are not two
        // off rotation entries for a given date.
        const orDate = new Date(item.date.toDate().setHours(0, 0, 0, 0));
        if (offRotationDates.includes(orDate.getTime())) {
          throw new functions.https.HttpsError(
            "failed-precondition",
            "More than one Off-Rotation entry exists for" +
              format(orDate, "yyyy MMM dd")
          );
        } else {
          offRotationDates.push(orDate.getTime());
        }
        console.log(offRotationDates.toString());
      } else if (item.timetype === "OTO") {
        // This is an overtime payout request entry, store it in payoutRequests
        // array for processing after completing the tallies.
        payoutRequests.push(item);
      } else if (item.timetype === "RB") {
        // This is an overtime bank entry, store it in the bankEntries
        // array for processing after completing the tallies.
        bankEntries.push(item);
      } else if (item.timetype === "R" && item.division && item.divisionName && (item.hours || item.jobHours)) {
        // Tally the regular work hours
        if (item.hours) {
          workHoursTally["hours"] += item.hours;
        }
        if (item.jobHours) {
          workHoursTally["jobHours"] += item.jobHours;
        }
        if (item.mealsHours) {
          mealsHoursTally += item.mealsHours;
        }

        // Tally the divisions (must be present for work hours)
        divisionsTally[item.division] = item.divisionName;

        // Tally the jobs (may not be present)
        if (item.job && item.jobDescription && item.client) {
          if (item.job in jobsTally) {
            // a previous entry already tracked this job, add to totals
            const hours = item.hours
              ? jobsTally[item.job].hours + item.hours
              : jobsTally[item.job].hours;
            const jobHours = item.jobHours
              ? jobsTally[item.job].jobHours + item.jobHours
              : jobsTally[item.job].jobHours;
            jobsTally[item.job] = {
              description: item.jobDescription,
              client: item.client,
              hours,
              jobHours,
            };
          } else {
            // first instance of this job in the timesheet, set totals to zero
            jobsTally[item.job] = {
              description: item.jobDescription,
              client: item.client,
              hours: item.hours || 0,
              jobHours: item.jobHours || 0,
            };
          }
        } else if (item.hours) {
          // keep track of the number of hours not associated with a job
          // (as opposed to job hours not billable to the client)
          workHoursTally["noJobNumber"] += item.hours;
        } else {
          throw new Error("The TimeEntry is of type Regular hours but no job or hours are present")
        }
      } else {
        if (!item.hours) {
          throw new Error("The TimeEntry is of type nonWorkHours but no hours are present");
        }
        // Tally the non-work hours
        if (item.timetype in nonWorkHoursTally) {
          nonWorkHoursTally[item.timetype] += item.hours;
        } else {
          nonWorkHoursTally[item.timetype] = item.hours;
        }
      }

      // timeEntry is of type "QueryDocumentSnapshot"
      entries.push(item);
      batch.delete(timeEntry.ref);
    });

    // TimeEntries are done being enumerated, now work on summaries
    // and validation of the TimeSheet as a whole

    // validate and tally bankedHours
    let bankedHours = 0;
    if (bankEntries.length > 1) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Only one overtime banking entry can exist on a timesheet."
      );
    } 
    if (bankEntries.length === 1 && bankEntries[0].hours) {
      bankedHours = bankEntries[0].hours;

      // The sum of all hours worked minus the banked hours mustn't be under 44
      if (workHoursTally.hours + workHoursTally.jobHours - bankedHours < 44) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Banked hours cannot bring your total worked hours below 44 hours on a timesheet."
        );
      }
    }

    // validate and tally payoutRequest
    let payoutRequest = 0;
    if (payoutRequests.length > 1) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Only one payout request entry can exist on a timesheet."
      );
    } 
    if (payoutRequests.length === 1 && payoutRequests[0].payoutRequestAmount) {
      payoutRequest = payoutRequests[0].payoutRequestAmount;
    }

    /*
    // Prevent users from entering more than 14 consecutive off-rotation days

    if (offRotationDates.length > 0) {
      // Check off roation tally of previous two weeks and reject if
      // this timesheet pushes cumulative total over 14
      const previousTimeSheets = await db
        .collection("TimeSheets")
        .where("uid", "==", auth.uid)
        .where("weekEnding", ">=", subWeeks(week, 2))
        .where("weekEnding", "<", week)
        .get();
      if (!previousTimeSheets.empty) {
        // There are 1 or more timesheets in the previous 2 weeks.
        // Check them for off rotation totals
        let cumulativeOffRotationTally = 0;
        previousTimeSheets.forEach(timeSheet => {
          cumulativeOffRotationTally += timeSheet.get("offRotationDaysTally");
        });
        if (cumulativeOffRotationTally + offRotationDates.length > 14) {
          throw new functions.https.HttpsError(
            "failed-precondition",
            "There can not be more than consecutive 14 off-rotation days"
          );
        }
      }
    }
    */

    // get the entire job document for each key in the jobsTally
    // and store it in the tally so the info is available for reports
    // jobsTally entries already have name, hours, jobHours properties
    for (const job in jobsTally) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const snap = await db.collection("Jobs").doc(job).get();
        // fold in existing data
        Object.assign(jobsTally[job], snap.data());
      } catch (error) {
        throw new functions.https.HttpsError(
          "internal",
          `failed to tally details of job ${job}: ${error.message}`
        );
      }
    }
    // Load the profile for the user to get manager information
    const profile = await db.collection("Profiles").doc(auth.uid).get();
    if (profile.exists) {
      const managerUid = profile.get("managerUid");
      if (managerUid !== undefined) {
        // Verify that the auth user with managerUid exists
        let manager;
        try {
          manager = await admin.auth().getUser(managerUid);
        } catch (error) {
          // The Profile for this user likely specifies an identifier
          // (managerUid) that doesn't correspond to valid User Record.
          throw new functions.https.HttpsError("internal", error.message);
        }
        const claims = manager.customClaims;
        if (claims && claims["tapr"] === true) {
          // The profile contains a valid manager, build the TimeSheet document
          const timesheet = db.collection("TimeSheets").doc();
          batch.set(timesheet, {
            uid: auth.uid,
            displayName: profile.get("displayName"),
            managerName: profile.get("managerName"),
            weekEnding: week,
            managerUid: managerUid,
            locked: false,
            approved: false,
            rejected: false,
            rejectionReason: "",
            submitted: false,
            entries,
            nonWorkHoursTally,
            offRotationDaysTally: offRotationDates.length,
            workHoursTally,
            mealsHoursTally,
            divisionsTally,
            jobsTally,
            bankedHours,
            payoutRequest,
          });
          return batch.commit();
        } else {
          throw new functions.https.HttpsError(
            "failed-precondition",
            "The manager specified in the Profile doesn't have required permissions"
          );
        }
      } else {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "The Profile for this user doesn't contain a managerUid"
        );
      }
    } else {
      throw new functions.https.HttpsError(
        "not-found",
        "A Profile doesn't exist for this user"
      );
    }
  } else {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `There are no entries for the week ending ${format(week, "yyyy MMM dd")}`
    );
  }
};

export async function unbundleTimesheet(
  data: unknown, 
  context: functions.https.CallableContext
) {
  const db = admin.firestore();

  // throws if the caller isn't authorized
  const auth = getAuthObject(context, ["time"]);

  // Validate the data or throw
  // use a User Defined Type Guard
  if (!isDocIdObject(data)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The provided data doesn't contain a document id"
    );
  }

  const timeSheet = await db.collection("TimeSheets").doc(data.id).get()

  const tsData = timeSheet.data()
  if (tsData === undefined) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `There is no matching TimeSheet document for id ${data.id}`
    )
  }

  if (tsData.uid !== auth.uid) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "A timesheet can only be unbundled by its owner"
    );
  }

  if (tsData.submitted === true) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "A submitted timesheet cannot be unbundled"
    );
  }

  if (tsData.approved === true) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "An approved timesheet cannot be unbundled"
    );
  }

  if (tsData.locked === true) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "A locked timesheet cannot be unbundled"
    );
  }

  console.log("TimeSheet found, creating a batch");
  // Start a write batch
  const batch = db.batch();

  // Create new TimeEntres for each entries item in the TimeSheet
  tsData.entries.forEach((timeEntry: TimeEntry) => {
    // timeEntry is of type "QueryDocumentSnapshot"
    // TODO: Possibly must add back redundant data removed in bundle
    const entry = db.collection("TimeEntries").doc();
    batch.set(entry, timeEntry);
  });

  // Delete the TimeSheet
  batch.delete(timeSheet.ref);
  return batch.commit();
};

// add weekEnding property to TimeEntries on create or update
export const writeWeekEnding = functions.firestore
  .document("TimeEntries/{entryId}")
  .onWrite(async (change, context) => {
    if (change.after.exists) {
      // The TimeEntry was not deleted
      const afterData = change.after.data();
      if (afterData === undefined) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `Cannot read TimeEntry with id ${change.after.id} during writeWeekEnding`
        )
      }
      let date;
      try {
        // get the date from the TimeEntry
        date = afterData.date.toDate();
      } catch (error) {
        console.log(
          `unable to read date for TimeEntry with id ${change.after.id}`
        );
        throw error;
      }
      // If weekEnding is defined on the TimeEntry, get it, otherwise set null
      const weekEnding = Object.prototype.hasOwnProperty.call(
        afterData,
        "weekEnding"
      )
        ? afterData.weekEnding.toDate()
        : null;

      // Calculate the correct saturday of the weekEnding
      // (in America/Thunder_Bay timezone)
      let calculatedSaturday;
      if (date.getDay() === 6) {
        // assume the date is already in America/Thunder_Bay Time Zone
        console.log("writeWeekEnding() date is already a saturday");
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

      // update the TimeEntry only if required
      if (
        weekEnding === null ||
        weekEnding.toDateString() !== calculatedSaturday.toDateString
      ) {
        return change.after.ref.set(
          { weekEnding: calculatedSaturday },
          { merge: true }
        );
      }

      // no changes to be made
      return null;
    } else {
      // The TimeEntry was deleted, do nothing
      console.log("writeWeekEnding() called but time entry was deleted");
      return null;
    }
  });

/*
  If a timesheet is approved, make sure that it is included in the pending
  property of the TimeTracking document for the corresponding weekEnding.

  If a timesheet is manually unlocked, make sure that it is removed from the
  timeSheets property and added back to the pending property of the TimeTracking
  document for the corresponding weekEnding.
 */
export const updateTimeTracking = functions.firestore
  .document("TimeSheets/{timesheetId}")
  .onWrite(async (change, context) => {
    const db = admin.firestore();
    const beforeData = change.before.data();
    const afterData = change.after.data();
    let beforeApproved: boolean;
    let beforeLocked: boolean;
    let weekEnding: Date;
    if (beforeData) {
      // the TimeSheet was updated
      beforeApproved = beforeData.approved
      beforeLocked = beforeData.locked
      weekEnding = beforeData.weekEnding.toDate();
    }
    else if (afterData) {
      // the TimeSheet was just created
      beforeApproved = false;
      beforeLocked = false;
      weekEnding = afterData.weekEnding.toDate();
    }
    else {
      // This should never happen because either a before or after document
      // must exist, but it is here because the if/else branch
      // above will not assign a value to beforeApproved or weekEnding in 
      // this case and TypeScript notices that
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Both the before and after DocumentSnapshots contain no data"
      );
    }

    // Get the TimeTracking doc if it exists, otherwise create it.
    const querySnap = await db
      .collection("TimeTracking")
      .where("weekEnding", "==", weekEnding)
      .get();

    let timeTrackingDocRef;
    if (querySnap.size > 1) {
      throw new Error(
        `There is more than one document in TimeTracking for weekEnding ${weekEnding}`
      );
    } else if (querySnap.size === 1) {
      // retrieve existing TimeTracking document
      timeTrackingDocRef = querySnap.docs[0].ref;
    } else {
      // create new TimeTracking document
      timeTrackingDocRef = db.collection("TimeTracking").doc();
      await timeTrackingDocRef.set({ weekEnding });
    }

    if (
      afterData &&
      afterData.approved !== beforeApproved &&
      afterData.approved === true &&
      afterData.locked === false
    ) {
      // add the newly approved TimeSheet to pending
      return timeTrackingDocRef.update(
        {
          [`pending.${change.after.ref.id}`]: { displayName: afterData.displayName, uid: afterData.uid },
        }
      );
    } else if (
      afterData &&
      afterData.locked !== beforeLocked &&
      afterData.locked === false &&
      afterData.approved === true
    ) {
      // remove the *manually* unlocked Time Sheet from timeSheets 
      // and add it to pending
      console.log(`TimeSheet ${change.after.ref.id} has been manually unlocked. The export JSON will not be updated again until lockTimesheets() is called`);
      return timeTrackingDocRef.update(
        {
          [`pending.${change.after.ref.id}`]: { displayName: afterData.displayName, uid: afterData.uid },
          [`timeSheets.${change.after.ref.id}`]: admin.firestore.FieldValue.delete(),
        }
      );
    } else {
      // remove the TimeSheet from pending
      return timeTrackingDocRef.update(
        {
          [`pending.${change.after.ref.id}`]: admin.firestore.FieldValue.delete(),
        },
      );
    }
  });

/*
  Given a weekEnding as a property of data, lock all of the currently
  approved TimeSheets and add their ids to the timeSheets property array
  of the TimeTracking doc.

  TODO:
  write exportTimesheets function that triggers on TimeTracking write and
  exports *new* items in the timeSheets array to a new JSON doc in Google Cloud
  Storage. The TimeTracking "exports" array field is updated with a link to
  the new document. The function also updates a "consolidated" document which
  contains all of the exports together as well as the individual exports. In
  this way users can see what they've already done.
 */
export async function lockTimesheets(data: unknown, context: functions.https.CallableContext) {
  if (!hasPermission(context)) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Call to lockTimesheets() failed"
    );
  }

  // Validate the data or throw
  // use a User Defined Type Guard
  if (!isWeekReference(data)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The provided data isn't a valid week reference"
    );
  }

  const tbay_week = utcToZonedTime(
    new Date(data.weekEnding),
    "America/Thunder_Bay"
  );

  // Overwrite the time to 23:59:59.999 in America/Thunder_Bay time zone
  tbay_week.setHours(23, 59, 59, 999);

  // verify tbay_week is a Saturday in America/Thunder_Bay time zone
  if (tbay_week.getDay() !== 6) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The week ending specified is not a Saturday"
    );
  }

  // Convert back to UTC for queries against firestore
  const weekEnding = zonedTimeToUtc(new Date(tbay_week), "America/Thunder_Bay");

  // Look for TimeSheets to export
  const db = admin.firestore();
  const timeSheets = await db
    .collection("TimeSheets")
    .where("approved", "==", true)
    .where("locked", "==", false)
    .where("weekEnding", "==", weekEnding)
    .get();

  if (!timeSheets.empty) {
    /* TODO: for each Timesheet, run a transaction to verify
      that submitted & approved are true and that it isn't locked. Then lock it, 
      and add it as an array element to the timeSheets property of the export
      document that has week_ending.getTime() as ID. Create the export document
      if it doesn't already exist.
        
      The idea here is that at some point we can delete locked TimeSheets from
      the database as they're aggregated into TimeTracking. This assists in data
      management while preserving values for future use and reducing queries
    */

    // Get the TimeTracking doc if it exists, otherwise create it.
    const querySnap = await db
      .collection("TimeTracking")
      .where("weekEnding", "==", weekEnding)
      .get();

    let timeTrackingDocRef: admin.firestore.DocumentReference;
    if (querySnap.size > 1) {
      throw new Error(
        `There is more than one document in TimeTracking for weekEnding ${weekEnding}`
      );
    } else if (querySnap.size === 1) {
      timeTrackingDocRef = querySnap.docs[0].ref;
    } else {
      throw new Error(
        `There is no TimeTracking document for weekEnding ${weekEnding}`
      );
    }

    const transactions: Promise<admin.firestore.Transaction>[] = [];
    timeSheets.forEach((timeSheet) => {
      const trans = db.runTransaction(async (transaction) => {
        return transaction.get(timeSheet.ref).then(async (tsSnap) => {
          const snapData = tsSnap.data();
          if (!snapData) {
            throw new Error("A DocumentSnapshot was empty during the locking transaction")
          }
          if (
            snapData.submitted === true &&
            snapData.approved === true &&
            snapData.locked === false
          ) {
            // timesheet is lockable, lock it then add it to the export
            return transaction
              .update(timeSheet.ref, { locked: true })
              .update(timeTrackingDocRef, {
                [`timeSheets.${tsSnap.id}`]: { displayName: snapData.displayName, uid: snapData.uid },
              });
          } else {
            throw new Error(
              "The timesheet has either not been submitted and approved " +
                "or it was already locked"
            );
          }
        });
      });
      transactions.push(trans);
    });
    return Promise.all(transactions).then(() => {
      return exportJson(
        { id: timeTrackingDocRef.id },
        context
      );
    });
  } else {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `There are no outstanding approved timesheets for the week ending ${format(
        utcToZonedTime(weekEnding, "America/Thunder_Bay"),
        "yyyy MMM dd"
      )}`
    );
  }
};

// Given a TimeTracking id, create or update a file on Google storage
// with the locked timeSheets
export async function exportJson(data: unknown, context: functions.https.CallableContext) {
  if (hasPermission(context)) {
    // Get locked TimeSheets
    const db = admin.firestore();

    // Validate the data or throw
    // use a User Defined Type Guard
    if (!isDocIdObject(data)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "The provided data doesn't contain a document id"
      );
    }

    const trackingSnapshot = await db
      .collection("TimeTracking")
      .doc(data.id)
      .get();
    const timeSheetsSnapshot = await db
      .collection("TimeSheets")
      .where("approved", "==", true)
      .where("locked", "==", true)
      .where("weekEnding", "==", trackingSnapshot.get("weekEnding"))
      .get();

    // delete internal properties for each timeSheet
    const timeSheets = timeSheetsSnapshot.docs.map((doc) => {
      const docData = doc.data();
      delete docData.submitted;
      delete docData.approved;
      delete docData.locked;
      delete docData.rejected;
      delete docData.rejectionReason;
      docData.weekEnding = docData.weekEnding.toDate();
      docData.entries.map((entry: TimeEntry) => {
        const cleaned: any = entry;
        delete cleaned.weekEnding;
        cleaned.date = entry.date.toDate();
        return cleaned;
      });
      return docData;
    });

    // generate JSON output
    const output = JSON.stringify(timeSheets);

    // make the filename based on milliseconds since UTC epoch
    const filename = `${trackingSnapshot
      .get("weekEnding")
      .toDate()
      .getTime()}.json`;
    const tempLocalFileName = path.join(os.tmpdir(), filename);

    return new Promise<void>((resolve, reject) => {
      //write contents of json into the temp file
      fs.writeFile(tempLocalFileName, output, (error) => {
        if (error) {
          reject(error);
          return;
        }

        const bucket = admin.storage().bucket();
        const destination = "TimeTrackingExports/" + filename;
        const newToken = uuidv4();

        // upload the file into the current firebase project default bucket
        bucket
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
              json: createPersistentDownloadUrl(
                admin.storage().bucket().name,
                destination,
                newToken
              ),
            });
            return resolve();
          })
          .catch((err) => reject(err));
      });
    });
  } else {
    throw new functions.https.HttpsError(
      "permission-denied",
      "call to exportJson() failed"
    );
  }
};

// Confirm the context has "tadm" claim and throw userful errors as necessary
function hasPermission(context: functions.https.CallableContext) {
  if (!context.auth) {
    // Throw an HttpsError so that the client gets the error details
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Caller must be authenticated"
    );
  }

  // caller must have the "tadm" claim
  if (
    !(
      Object.prototype.hasOwnProperty.call(context.auth.token, "tadm") &&
      context.auth.token["tadm"] === true
    )
  ) {
    // Throw an HttpsError so that the client gets the error details
    throw new functions.https.HttpsError(
      "permission-denied",
      `Caller must have the time administration permission`
    );
  } else {
    return true;
  }
}

// If a file object's metadata changes, ensure that the links to it
// inside the corresponding TimeTracking object are updated so that
// downloads continue to work. This allows us to update the token in
// the firebase console for security reasons without breaking the app
// https://www.sentinelstand.com/article/guide-to-firebase-storage-download-urls-tokens
export const writeFileLinks = functions.storage
  .object()
  .onMetadataUpdate(async (objMeta: functions.storage.ObjectMetadata) => {
    const db = admin.firestore();

    // The object name is milliseconds since epoch UTC of weekEnding
    // derrive the weekEnding from it.
    if (typeof objMeta.name !== "string" || objMeta.metadata === undefined) {
      throw new Error("The object metadata is missing information");
    }
    const parsed = path.parse(objMeta.name);
    const weekEnding = new Date(Number(parsed.name));

    if (isNaN(weekEnding.getTime())) {
      throw new Error(
        `filename ${parsed.name} cannot be converted to a date object`
      );
    }

    // Get the TimeTracking doc or throw
    const querySnap = await db
      .collection("TimeTracking")
      .where("weekEnding", "==", weekEnding)
      .get();

    let timeTrackingDocRef;
    if (querySnap.size > 1) {
      throw new Error(
        `There is more than one document in TimeTracking for weekEnding ${weekEnding}`
      );
    } else if (querySnap.size === 1) {
      timeTrackingDocRef = querySnap.docs[0].ref;
    } else {
      throw new Error(
        `There are no documents in TimeTracking for weekEnding ${weekEnding}`
      );
    }

    return timeTrackingDocRef.update({
      [parsed.ext.substring(1)]: createPersistentDownloadUrl(
        admin.storage().bucket().name,
        objMeta.name,
        objMeta.metadata.firebaseStorageDownloadTokens
      ),
    });
  });

const createPersistentDownloadUrl = (bucket: string, pathToFile: string, downloadToken: string) => {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(
    pathToFile
  )}?alt=media&token=${downloadToken}`;
};