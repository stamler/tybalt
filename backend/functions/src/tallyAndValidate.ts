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

  // Get the workWeekHours setting it to a default of 40 if it doesn't exist
  const wwh = profile.get("workWeekHours");
  if (!["number", "undefined"].includes(typeof wwh)) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "workWeekHours must be a number"
    );
  }
  const workWeekHours = wwh > 0 && wwh <= 40 ? wwh : 40;
  
  // Put the existing timeEntries into an array then delete from Collection
  const entries: TimeEntry[] = [];
  const workrecords: string[] = [];
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

    if (item.workrecord) {
      workrecords.push(item.workrecord);
    }
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

  // validate that a workrecord wasn't used in more than one entry
  if (new Set(workrecords).size !== workrecords.length) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The same work record appears in multiple entries"
    );
  }

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

  // prevent staff from using vacation or PPTO to raise their timesheet hours
  // beyond workWeekHours.
  const discretionaryTimeOff = 
    (nonWorkHoursTally.OV ?? 0) + 
    (nonWorkHoursTally.OP ?? 0);
  if (
    discretionaryTimeOff > 0 && 
    workHoursTally.hours + workHoursTally.jobHours + nonWorkHoursTotal > workWeekHours
  ) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `You cannot claim Vacation or PPTO entries that increase total hours beyond ${workWeekHours}.`
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

  // prevent salaried employees from claiming off rotation (OR) unless permitted
  if (
    profile.get("salary") === true &&
    offRotationDates.length > 0 &&
    (profile.get("offRotation") === undefined || profile.get("offRotation") === false)
  ) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Salaried staff need permission to claim Off Rotation Entries. Speak with your manager."
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

  // require salaried employees to have at least workWeekHours hours on a
  // timesheet unless their profile has untrackedTimeOff:true OR
  // skipMinTimeCheckOnNextBundle:true
  const skipMinTimeCheck = profile.get("skipMinTimeCheckOnNextBundle");
  const offRotationHours = offRotationDates.length * 8;
  if (
    profile.get("salary") === true &&
    workHoursTally.hours + workHoursTally.jobHours + nonWorkHoursTotal + offRotationHours < workWeekHours
  ) {
    if (skipMinTimeCheck !== true && profile.get("untrackedTimeOff") !== true) {      
      throw new functions.https.HttpsError(
        "failed-precondition",
        `You must have a minimum of ${workWeekHours} hours on each time sheet.`
      )
    }
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

  // prevent salaried employees w/ untrackedTimeOff:true claiming OB, OH, OP, OV
  if(profile.get("salary") === true && profile.get("untrackedTimeOff") === true) {
    ["OB", "OH", "OP", "OV"].map(x => {
      if (Object.prototype.hasOwnProperty.call(nonWorkHoursTally, x)) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `Staff with untracked time off are only permitted to create TimeEntries of type “Hours Worked” or “Training”`
        )
      }  
    });
  }

  // throw if openingDateTimeOff isn't a Timestamp
  if (!(profile.get("openingDateTimeOff") instanceof admin.firestore.Timestamp)) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The Profile for this user doesn't contain a valid openingDateTimeOff value"
    )
  }

  // throw if openingDateTimeOff is after the weekEnding value. This will
  // prevent submission of an old timesheet if the openingDateTimeOff value has
  // already been updated to the next fiscal year. This error is only triggered
  // if PPTO or Vacation are claimed on this timesheet.
  const opdate: Date = profile.get("openingDateTimeOff").toDate();
  if (discretionaryTimeOff > 0 && opdate > weekEnding) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Your opening balances were set effective ${opdate.toISOString()} but you are submitting a timesheet for a period prior to that. Have accounting revert to earlier values prior to submitting this timesheet.`
    )
  }

  // tybalt stores a timeOffResetDates array in the AnnualDates document within
  // the Config collection. The dates in this array represent moment when the
  // PPTO and Vacation balances are reset each year. Each timesheet submission
  // is checked against this array to find the most recent date that is less
  // than the weekEnding date of that timesheet. This most recent date must be
  // less than or equal to the openingDateTimeOff value in the profile. If it
  // isn't, then the opening balances are out of date and the timesheet cannot
  // be submitted until the opening balances are updated by accounting. This is
  // to prevent the user from claiming expired time off from a previous year on
  // a timesheet in the following year. This error is only triggered if PPTO or
  // Vacation are claimed on this timesheet.
  const annualDates = await db.collection("Config").doc("AnnualDates").get()
  const timeOffResetDates: admin.firestore.Timestamp[] = annualDates.get("timeOffResetDates");
  const mostRecentResetDate: admin.firestore.Timestamp = timeOffResetDates.reduce((a, b) => {
    return (b.toDate() < weekEnding && b.toDate() > a.toDate()) ? b : a;
  }, admin.firestore.Timestamp.fromDate(new Date(0)));
  
  if (discretionaryTimeOff > 0 && mostRecentResetDate.toDate() > opdate) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Your opening balances were set effective ${opdate.toISOString()} but you are submitting a timesheet for the time-off accounting period beginning on ${mostRecentResetDate.toDate().toISOString()}. Please contact accounting to have your opening balances updated for the new period prior to submitting a timesheet for this period.`
    )
  }

  // throw if OP balance is unavailable
  const openingOP = profile.get("openingOP")
  if (typeof openingOP !== "number" || openingOP < 0) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The Profile for this user doesn't contain a valid openingOP value"
    )
  }

  // throw if OV balance is unavailable
  const openingOV = profile.get("openingOV");
  if (typeof openingOV !== "number" || openingOV < 0) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The Profile for this user doesn't contain a valid openingOV value"
    )
  }
  
  // throw if usedOP isn't a positive number or undefined
  const usedOPRaw = profile.get("usedOP");
  if (
      usedOPRaw !== undefined && 
      (
        typeof usedOPRaw !== "number" || 
        usedOPRaw < 0
      )
    ) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "The Profile for this user doesn't contain a valid usedOP value"
      )
  }
  // if usedOP is undefined, set it to zero
  const usedOP = usedOPRaw || 0;

  // throw if usedOV isn't a positive number or undefined
  const usedOVRaw = profile.get("usedOV");
  if (
    usedOVRaw !== undefined && 
    (
      typeof usedOVRaw !== "number" || 
      usedOVRaw < 0
    )
  ) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The Profile for this user doesn't contain a valid usedOV value"
    )
  }
  const usedOV = usedOVRaw || 0;

  // throw if openingOP - usedOP < nonWorkHoursTally.OP
  if(openingOP - usedOP < nonWorkHoursTally.OP) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Your PPTO claim exceeds your available PPTO balance."
    )
  }

  // throw if openingOV - usedOV < nonWorkHoursTally.OV
  if(openingOV - usedOV < nonWorkHoursTally.OV) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Your Vacation claim exceeds your available Vacation balance."
    )
  }

  // throw if openingOV - usedOV - nonWorkHoursTally.OV >= nonWorkHoursTally.OP
  if(openingOV - usedOV - (nonWorkHoursTally.OV || 0) >= nonWorkHoursTally.OP) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "You must exhaust your Vacation balance prior to claiming PPTO per company policy."
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
    } catch (error: unknown) {
      const typedError = error as functions.https.HttpsError;
      throw new functions.https.HttpsError(
        "internal",
        `failed to open ${job}: ${typedError.message}`
      );
    }
  }

  // get manager information from profile
  // managerUid and payrollId can have initial values of null to allow
  // editing by users of default division
  const managerUid = profile.get("managerUid");
  const payrollId = profile.get("payrollId");
  if (payrollId === undefined || payrollId === null) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The Profile for this user doesn't contain a payrollId"
    );
  }
  if (managerUid === undefined || managerUid === null) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The Profile for this user doesn't contain a managerUid"
    );
  }

  return {
    workWeekHours,
    skipMinTimeCheck, // remove this from the result before adding to database
    uid: auth.uid,
    surname: profile.get("surname"),
    givenName: profile.get("givenName"),
    displayName: profile.get("displayName"),
    managerName: profile.get("managerName"),
    salary: profile.get("salary"),
    payrollId,
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