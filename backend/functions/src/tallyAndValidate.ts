import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { TimeEntry, AuthObject } from "./utilities";
import { format } from "date-fns";
// Lines 114-366 from bundleTimesheets.ts
export async function tallyAndValidate(
  auth: AuthObject,
  profile: admin.firestore.DocumentSnapshot<admin.firestore.DocumentData>,
  timeEntries: admin.firestore.QuerySnapshot<admin.firestore.DocumentData>, 
  weekEnding: Date,
  ) {

  const db = admin.firestore();

  // Put the existing timeEntries into an array then delete from Collection
  const entries: TimeEntry[] = [];
  const bankEntries: TimeEntry[] = [];
  const payoutRequests: TimeEntry[] = [];
  const offRotationDates: number[] = [];
  const offWeek: number[] = [];
  const nonWorkHoursTally: { [timetype: string]: number } = {}; // value is total
  let mealsHoursTally = 0;
  const workHoursTally = { hours: 0, jobHours: 0, noJobNumber: 0 };
  const divisionsTally: { [division: string]: string } = {}; // value is divisionName
  const timetypes = new Set();
  const jobsTally: { [job: string]: { description: string, client: string, hours: number, jobHours: number } } = {};
  timeEntries.forEach((timeEntry) => {
    const item = timeEntry.data() as TimeEntry;
    // TODO: validate timeEntry.data() against TimeEntry type with type guard
    // TODO: build a tree of types and operate on them based on type. This would
    // simplify below code. For example RegularTimeEntry, BankTimeEntry,
    // NonWorkTimeEntry, OffRotationTimeEntry with corresponding type guards

    timetypes.add(item.timetype);
    if (item.timetype === "OR") {
      // Count the off rotation dates and ensure that there are not two
      // off rotation entries for a given date.
      const orDate = new Date(item.date.toDate().setHours(0, 0, 0, 0));
      if (offRotationDates.includes(orDate.getTime())) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "More than one Off-Rotation entry exists for " +
            format(orDate, "yyyy MMM dd")
        );
      } else {
        offRotationDates.push(orDate.getTime());
      }
    } else if (item.timetype === "OW") {
      // Count the off dates and ensure that there are not two
      // off rotation entries for a given date.
      const orDate = new Date(item.date.toDate().setHours(0, 0, 0, 0));
      if (offWeek.includes(orDate.getTime())) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "More than one Off entry exists for " +
            format(orDate, "yyyy MMM dd")
        );
      } else {
        offWeek.push(orDate.getTime());
      }
    } else if (item.timetype === "OTO") {
      // This is an overtime payout request entry, store it in payoutRequests
      // array for processing after completing the tallies.
      payoutRequests.push(item);
    } else if (item.timetype === "RB") {
      // This is an overtime bank entry, store it in the bankEntries
      // array for processing after completing the tallies.
      bankEntries.push(item);
    } else if ((item.timetype === "R" || item.timetype === "RT") && item.division && item.divisionName && (item.hours || item.jobHours)) {
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
        throw new Error("The TimeEntry is missing an hours field");
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

    if (profile.get("salary") === true) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Salaried staff cannot bank overtime."
      )
    }

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
    if (profile.get("salary") === true) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Salaried staff cannot request overtime payouts. Please speak with management."
      )
    }
    payoutRequest = payoutRequests[0].payoutRequestAmount;
  
  }

  // calculate total non-work hours
  const nonWorkHoursTotal = Object.values(nonWorkHoursTally).reduce((a,b) => a + b, 0);

  // prevent salaried employees from using vacation or PPTO to raise their
  // timesheet hours beyond 40.
  const discretionaryTimeOff = 
    (nonWorkHoursTally.OV ?? 0) + 
    (nonWorkHoursTally.OP ?? 0);
  if (
    profile.get("salary") === true &&
    discretionaryTimeOff > 0 && 
    workHoursTally.hours + workHoursTally.jobHours + nonWorkHoursTotal > 40
  ) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Salaried staff cannot claim Vacation or PPTO entries that increase total hours beyond 40."
    );
  }

  // prevent salaried employees from claiming full day off (OW)
  if (
    profile.get("salary") === true &&
    offWeek.length > 0
  ) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Salaried staff cannot claim a Full Week Off. Please use PPTO or vacation instead."
    )
  }

  // prevent hourly employees from more than one full week off entry (OW)
  if (offWeek.length > 1) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Only one Full Week Off entry can be claimed per week."
    )
  }

  // prevent hourly employees from claiming any other entry with one full week off entry (OW)
  if (offWeek.length > 0 && timeEntries.size > 1) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "A Full Week Off entry must be the only entry in a week."
    )
  }

  // require salaried employees to have at least 40 hours on a timesheet
  const offRotationHours = offRotationDates.length * 8;
  if (
    profile.get("salary") === true &&
    workHoursTally.hours + workHoursTally.jobHours + nonWorkHoursTotal + offRotationHours < 40
  ) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Salaried staff must have a minimum of 40 hours on each time sheet."
    )
  }

  // prevent salaried employees from claiming sick time
  if (
    profile.get("salary") === true &&
    Object.prototype.hasOwnProperty.call(nonWorkHoursTally, "OS") 
  ) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Salaried staff cannot claim Sick time. Please use PPTO or vacation instead."
    )
  }

  // get the entire job document for each key in the jobsTally
  // and store it in the tally so the info is available for reports
  // jobsTally entries already have name, hours, jobHours properties
  for (const job in jobsTally) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const jobData = (await db.collection("Jobs").doc(job).get()).data();
      if (jobData?.status !== "Active") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Job status isn't Active. Ask a job admin to mark it Active then resubmit."
        )
      }
      // fold in existing data
      Object.assign(jobsTally[job], jobData);
    } catch (error) {
      throw new functions.https.HttpsError(
        "internal",
        `failed to open ${job}: ${error.message}`
      );
    }
  }

  // get manager information from profile
  // managerUid and tbtePayroll Uid have initial values of null to allow
  // editing by users of default division
  const managerUid = profile.get("managerUid");
  const tbtePayrollId = profile.get("tbtePayrollId");
  if (tbtePayrollId === undefined || tbtePayrollId === null) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The Profile for this user doesn't contain a tbtePayrollId"
    );
  }
  if (managerUid === undefined || managerUid === null) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The Profile for this user doesn't contain a managerUid"
    );
  }

  return {
    uid: auth.uid,
    surname: profile.get("surname"),
    givenName: profile.get("givenName"),
    displayName: profile.get("displayName"),
    managerName: profile.get("managerName"),
    salary: profile.get("salary"),
    tbtePayrollId,
    weekEnding,
    managerUid,
    locked: false,
    approved: (managerUid === auth.uid),
    rejected: false,
    rejectionReason: "",
    submitted: true,
    entries,
    nonWorkHoursTally,
    offRotationDaysTally: offRotationDates.length,
    offWeekTally: offWeek.length,
    workHoursTally,
    mealsHoursTally,
    divisionsTally,
    divisions: Object.keys(divisionsTally),
    timetypes: Array.from(timetypes),
    jobsTally,
    jobNumbers: Object.keys(jobsTally), // for array-contains queries
    bankedHours,
    payoutRequest,
  };
}