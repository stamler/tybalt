import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { getAuthObject, isWeekReference, TimeEntry } from "./utilities";
import { zonedTimeToUtc, utcToZonedTime } from "date-fns-tz";
import { format } from "date-fns";

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
          // TODO: client and description get added in "assign" operation
          // later so perhaps can be removed here and lines 218-219??
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
          surname: profile.get("surname"),
          givenName: profile.get("givenName"),
          displayName: profile.get("displayName"),
          managerName: profile.get("managerName"),
          weekEnding: week,
          managerUid: managerUid,
          locked: false,
          approved: false,
          rejected: false,
          rejectionReason: "",
          submitted: true,
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
