import { utcToZonedTime, zonedTimeToUtc } from "date-fns-tz";
import { format, addDays, subDays, differenceInDays } from "date-fns";
import firebase from "../firebase";
import { TimeSheet, isTimeSheet, Amendment } from "./types";
import _ from "lodash";
import { parse } from "json2csv";
import store from "../store";
import router from "../router";

const db = firebase.firestore();
const storage = firebase.storage();

// Given a number (result of getTime() from js Date object), verify that it is
// 23:59:59 in America/Thunder_bay on a saturday and that the saturday is a
// week 2 of a payroll at TBT Engineering. The definition of this is an
// integer multiple of 14 days after Dec 26, 2020 at 23:59:59.999 EST
// NB: THIS FUNCTION ALSO IN BACKEND utilities.ts
export function isPayrollWeek2(weekEnding: Date): boolean {
  const PAYROLL_EPOCH = new Date(Date.UTC(2020, 11, 27, 4, 59, 59, 999));

  // There will not be integer days if epoch and weekEnding are in different
  // time zones (EDT vs EST). Convert them both to the same timezone prior
  // to calculating the difference
  const tbayEpoch = utcToZonedTime(PAYROLL_EPOCH, "America/Thunder_Bay");
  const tbayWeekEnding = utcToZonedTime(weekEnding, "America/Thunder_Bay");
  const difference = differenceInDays(tbayWeekEnding, tbayEpoch);

  return difference % 14 === 0 ? true : false;
}

export function nextSaturday(date: Date): Date {
  let calculatedSaturday;
  const zonedTime = utcToZonedTime(date, "America/Thunder_Bay");
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
      "America/Thunder_Bay"
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
      "America/Thunder_Bay"
    );
  }
  return calculatedSaturday;
}

// return the same time 7 days from now in the given time zone
export function thisTimeNextWeekInTimeZone(
  datetime: Date,
  timezone: string
): Date {
  const zone_time = utcToZonedTime(datetime, timezone);
  return zonedTimeToUtc(addDays(zone_time, 7), timezone);
}

// This generator creates an iterable object that yields all pay period ending
// Date objects for the specified year but no later than today.
export function* payPeriodsForYear(year: number): Generator<Date, void, void> {
  const now = new Date();
  const firstSat = nextSaturday(new Date(year, 0, 0, 0, 0));
  let period = isPayrollWeek2(firstSat)
    ? firstSat
    : thisTimeNextWeekInTimeZone(firstSat, "America/Thunder_Bay");
  while (period.getFullYear() <= year && period < now) {
    yield period;
    period = thisTimeNextWeekInTimeZone(
      thisTimeNextWeekInTimeZone(period, "America/Thunder_Bay"),
      "America/Thunder_Bay"
    );
  }
}

// If an amendment has a corresponding timesheet, fold it into that
// timesheet and update the tallies for that timesheet. Otherwise
// just return the amendment by itself. Returns an object with a
// timesheets property whose value is an array of timesheets and
// an amendments property whose value is amendments that didn't have a
// corresponding timesheet.
export function foldAmendments(items: (TimeSheet | Amendment)[]) {
  const [amendments, timesheets] = _.partition(items, { amendment: true });
  const groupedAmendments = _.groupBy(amendments, "uid") as {
    [x: string]: Amendment[];
  };
  const unfoldedAmendmentsOutput = [] as Amendment[];
  for (const uid in groupedAmendments) {
    const destination = timesheets.find((a) => a.uid === uid) as TimeSheet;
    if (destination !== undefined) {
      // record each amendment's week in the timesheet
      destination.hasAmendmentsForWeeksEnding = [];

      // There is a destination timesheet to fold amendments into.
      // Load the existing tallies
      const workHoursTally = destination["workHoursTally"];
      const nonWorkHoursTally = destination["nonWorkHoursTally"];
      let mealsHoursTally = destination["mealsHoursTally"];
      const divisionsTally = destination["divisionsTally"];
      const jobsTally = destination["jobsTally"];

      // fold all of the amendments in groupedAmendments[uid] into
      // destination and update tallies
      // tally the amendments
      for (const item of groupedAmendments[uid]) {
        // record the week ending of this amendment
        destination.hasAmendmentsForWeeksEnding.push(item.weekEnding);
        if (
          ["R", "RT"].includes(item.timetype) &&
          item.division &&
          item.divisionName &&
          (item.hours || item.jobHours)
        ) {
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
            throw new Error(
              "foldAmendments: The TimeEntry is of type Regular hours but no job or hours are present"
            );
          }
        } else {
          if (!item.hours) {
            throw new Error(
              "foldAmendments: The Amendment is of type nonWorkHours but no hours are present"
            );
          }
          // Tally the non-work hours
          if (item.timetype in nonWorkHoursTally) {
            nonWorkHoursTally[item.timetype] += item.hours;
          } else {
            nonWorkHoursTally[item.timetype] = item.hours;
          }
        }

        // mark this entry as an amendment
        item.amendment = true;

        // add the amendment to timesheet entries
        destination["entries"].push(item);
      }

      // merge the tallies. Because objects are edit-in-place, we only
      // need to reassign the mealsHours which is a primitive value
      destination["mealsHoursTally"] = mealsHoursTally;
    } else {
      // all of the amendments in groupedAmendments[uid] do not match
      // a timesheet and must be exported separately
      unfoldedAmendmentsOutput.push(...groupedAmendments[uid]);
    }
  }
  return {
    timesheets,
    amendments: unfoldedAmendmentsOutput,
  };
}

export async function generateTimeReportCSV(
  urlOrFirestoreTimeSheet: string | firebase.firestore.DocumentData
) {
  let items: (TimeSheet | Amendment)[];
  let amendments: Amendment[];
  let firestoreDoc = false;
  if (typeof urlOrFirestoreTimeSheet === "string") {
    // the arg is a url for a json document
    const response = await fetch(urlOrFirestoreTimeSheet);
    const inputObject = (await response.json()) as (TimeSheet | Amendment)[];
    const { timesheets, amendments: amendmentsInIf } =
      foldAmendments(inputObject);
    items = timesheets;
    amendments = amendmentsInIf;
  } else {
    // the arg is firestore DocumentData. Convert timestamps to JS dates
    firestoreDoc = true;
    if (!isTimeSheet(urlOrFirestoreTimeSheet)) {
      throw new Error("(helpers1)There was an error validating the timesheet");
    }
    items = [urlOrFirestoreTimeSheet];
    amendments = [];
  }

  // since all entries have the same week ending, pull from the first entry
  let weekEnding;
  if (items.length > 0) {
    weekEnding = new Date(
      firestoreDoc ? items[0].weekEnding.toDate() : items[0].weekEnding
    );
  } else {
    weekEnding = new Date(amendments[0].committedWeekEnding);
  }
  const fields = [
    "client",
    "job",
    "division",
    "timetype",
    "date",
    "month",
    "year",
    "qty",
    "unit",
    "nc",
    "meals",
    "ref",
    "project",
    "description",
    "comments",
    "employee",
    "surname",
    "givenName",
    "amended",
  ];
  const opts = { fields, withBOM: true };

  const timesheetRecords = [];
  for (const item of items) {
    if (!isTimeSheet(item)) {
      throw new Error("(helpers2)There was an error validating the timesheet");
    }
    for (const entry of item.entries) {
      //if (!["R", "RT"].includes(entry.timetype)) continue;
      // TODO: verify that time zone conversion isn't needed here
      const date = new Date(firestoreDoc ? entry.date.toDate() : entry.date);
      const line = {
        client: "TBTE",
        job: "", // the job number
        division: entry.division,
        timetype: entry.timetype,
        date: date.getDate(),
        month: format(date, "MMM"),
        year: date.getFullYear(),
        qty: entry.jobHours || 0,
        unit: "hours",
        nc: entry.hours || 0,
        meals: entry.mealsHours || 0,
        ref: entry.workrecord || "",
        project: "",
        description: entry.workDescription, // consolidate comments and description
        comments: "",
        employee: item.displayName,
        surname: item.surname,
        givenName: item.givenName,
        amended: entry.amendment,
      };
      if (entry.job !== undefined) {
        // There is a job number, populate client, job, description
        line.client = item.jobsTally[entry.job].client;
        line.job = entry.job;
        line.project = item.jobsTally[entry.job].description;
      }
      timesheetRecords.push(line);
    }
  }

  const amendmentRecords = [];
  for (const entry of amendments) {
    if (entry.timetype !== "R") continue;
    // TODO: verify that time zone conversion isn't needed here
    const date = new Date(entry.date);
    const line = {
      client: "TBTE",
      job: "", // the job number
      division: entry.division,
      timetype: entry.timetype,
      date: date.getDate(),
      month: format(date, "MMM"),
      year: date.getFullYear(),
      qty: entry.jobHours || 0,
      unit: "hours",
      nc: entry.hours || 0,
      meals: entry.mealsHours || 0,
      ref: entry.workrecord || "",
      project: "",
      description: entry.workDescription, // consolidate comments and description
      comments: "",
      employee: entry.displayName,
      surname: entry.surname,
      givenName: entry.givenName,
      amended: true,
    };
    if (entry.job !== undefined) {
      // There is a job number, populate client, job, description
      line.client = entry.client || "";
      line.job = entry.job;
      line.project = entry.jobDescription || "";
    }
    amendmentRecords.push(line);
  }

  const csv = parse(timesheetRecords.concat(amendmentRecords), opts);
  const blob = new Blob([csv], { type: "text/csv" });
  const filename = `time_report_${exportDateWeekStart(weekEnding)}-${exportDate(
    weekEnding
  )}.csv`;
  downloadBlob(
    blob,
    firestoreDoc ? items[0].displayName + "-" + filename : filename
  );
}

export function exportDate(date: Date) {
  return format(date, "yyyy MMM dd");
}

export function exportDateWeekStart(date: Date) {
  const startDate = subDays(date, 6);
  return format(startDate, "yyyy MMM dd");
}

// Force the download of a blob to a file by creating an
// anchor and programmatically clicking it.
export function downloadBlob(blob: Blob, filename: string, inline = false) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  if (!inline) {
    a.download = filename || "download";
  }

  // release object URL after element has been clicked
  // required for one-off downloads of the blob content
  const clickHandler = () => {
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.removeEventListener("click", clickHandler);
    }, 150);
  };

  // Add the click event listener on the anchor element
  // Comment out this line if you don't want a one-off download of the blob content
  a.addEventListener("click", clickHandler, false);

  // Programmatically trigger a click on the anchor element
  // Useful if you want the download to happen automatically
  // Without attaching the anchor element to the DOM
  // Comment out this line if you don't want an automatic download of the blob content
  a.click();

  // Return the anchor element
  // Useful if you want a reference to the element
  // in order to attach it to the DOM or use it in some other way
  return a;
}

export async function downloadAttachment(
  item: firebase.firestore.DocumentData,
  sameTab?: boolean
) {
  const url = await storage.ref(item.attachment).getDownloadURL();
  if (sameTab === true) {
    const a = document.createElement("a");
    a.href = url;
    a.download = "download";
    a.click();
    return a;
  } else {
    window.open(url, "_blank");
  }
}

export function submitExpense(expenseId: string) {
  const submitExpense = firebase.functions().httpsCallable("submitExpense");
  store.commit("startTask", {
    id: `submit${expenseId}`,
    message: "submitting",
  });
  return submitExpense({ id: expenseId })
    .then(() => {
      store.commit("endTask", { id: `submit${expenseId}` });
    })
    .catch((error) => {
      store.commit("endTask", { id: `submit${expenseId}` });
      alert(`Error submitting expense: ${error}`);
    });
}

export function searchString(item: firebase.firestore.DocumentData) {
  const fields = Object.values(item);
  fields.push(item.id);
  return fields.join(",").toLowerCase();
}

export function copyEntry(
  item: firebase.firestore.DocumentData,
  collection: firebase.firestore.CollectionReference
) {
  if (confirm("Want to copy this entry to tomorrow?")) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { date, ...newItem } = item;
    newItem.date = addDays(item.date.toDate(), 1);
    store.commit("startTask", {
      id: `copy${item.id}`,
      message: "copying",
    });
    if (collection === null) {
      throw "There is no valid collection object";
    }
    return collection
      .add(newItem)
      .then(() => {
        store.commit("endTask", { id: `copy${item.id}` });
      })
      .catch((error) => {
        store.commit("endTask", { id: `copy${item.id}` });
        alert(`Error copying: ${error.message}`);
      });
  }
}

export function del(
  item: firebase.firestore.DocumentData,
  collection: firebase.firestore.CollectionReference
) {
  if (collection === null) {
    throw "There is no valid collection object";
  }
  collection
    .doc(item.id)
    .delete()
    .catch((err) => {
      alert(`Error deleting item: ${err}`);
    });
}

export function recallTs(timesheetId: string) {
  // A transaction is used to update the submitted field by
  // first verifying that approved is false. Similarly an approve
  // function for the approving manager must use a transaction and
  // verify that the timesheet is submitted before marking it approved
  store.commit("startTask", {
    id: `recall${timesheetId}`,
    message: "recalling",
  });
  const timesheet = db.collection("TimeSheets").doc(timesheetId);

  return db
    .runTransaction(function (transaction) {
      return transaction
        .get(timesheet)
        .then((tsDoc: firebase.firestore.DocumentSnapshot) => {
          if (!tsDoc.exists) {
            throw `A timesheet with id ${timesheetId} doesn't exist.`;
          }
          const data = tsDoc?.data() ?? undefined;
          if (data !== undefined && data.approved === false) {
            // timesheet is recallable because it hasn't yet been approved
            transaction.update(timesheet, { submitted: false });
          } else {
            throw "The timesheet was already approved by a manager";
          }
        });
    })
    .then(() => {
      store.commit("endTask", { id: `recall${timesheetId}` });
      return unbundle(timesheetId);
    })
    .catch(function (error) {
      store.commit("endTask", { id: `recall${timesheetId}` });
      alert(`Recall failed: ${error}`);
    });
}

export function unbundle(timesheetId: string) {
  store.commit("startTask", { id: "unbundle", message: "unbundling" });
  const unbundleTimesheet = firebase
    .functions()
    .httpsCallable("unbundleTimesheet");
  return unbundleTimesheet({ id: timesheetId })
    .then(() => {
      store.commit("endTask", { id: "unbundle" });
      router.push({ name: "Time Entries" });
    })
    .catch((error) => {
      store.commit("endTask", { id: "unbundle" });
      alert(`Error unbundling timesheet: ${error.message}`);
    });
}

export function submitTs(timesheetId: string) {
  store.commit("startTask", {
    id: `submit${timesheetId}`,
    message: "submitting",
  });
  db.collection("TimeSheets")
    .doc(timesheetId)
    .set({ submitted: true }, { merge: true })
    .then(() => {
      store.commit("endTask", { id: `submit${timesheetId}` });
      router.push({ name: "Time Sheets" });
    })
    .catch((error) => {
      store.commit("endTask", { id: `submit${timesheetId}` });
      alert(`Error submitting timesheet: ${error}`);
    });
}

export async function generatePayablesCSVSQL(
  timestamp: firebase.firestore.Timestamp,
  type: "payroll" | "weekly"
) {
  const start = new Date();
  store.commit("startTask", {
    id: `getExpensesSQL${start.getTime()}`,
    message: "Getting Expenses",
  });
  const weekEndingTbay = utcToZonedTime(
    timestamp.toDate(),
    "America/Thunder_Bay"
  );
  const queryValues = [format(weekEndingTbay, "yyyy-MM-dd")];
  const queryMySQL = firebase.functions().httpsCallable("queryMySQL");
  try {
    let response;
    // type determines whether we push out one or two weeks of data.
    if (type === "payroll") {
      response = await queryMySQL({
        queryName: "payablesPayrollCSV",
        queryValues,
      });
    } else if (type === "weekly") {
      response = await queryMySQL({
        queryName: "payablesWeeklyCSV",
        queryValues,
      });
    } else {
      throw new Error("Invalid type in generatePayablesCSVSQL");
    }
    // post-processing of response data for CSV conversion
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dat = response.data.map((x: any) => {
      const processed = x;
      // Coerce number-like payrollID strings to numbers
      if (isNaN(x.tbtePayrollId)) return processed; // string payroll ID
      processed.tbtePayrollId = Number(x.tbtePayrollId);
      return processed;
    });
    const csv = parse(dat);
    const blob = new Blob([csv], { type: "text/csv" });
    /* TODO: filename should represent the correct start and end dates of
    the report */
    let filename: string;
    if (type === "payroll") {
      filename = `SQLExpensesForPayPeriod_${exportDateWeekStart(
        subDays(weekEndingTbay, 7)
      )}-${exportDate(weekEndingTbay)}`;
    } else if (type === "weekly") {
      filename = `SQLPayables_${exportDateWeekStart(
        weekEndingTbay
      )}-${exportDate(weekEndingTbay)}`;
    } else {
      throw new Error("Invalid type in generatePayablesCSVSQL");
    }
    store.commit("endTask", { id: `getExpensesSQL${start.getTime()}` });
    downloadBlob(blob, `${filename}.csv`);
  } catch (error) {
    store.commit("endTask", { id: `getExpensesSQL${start.getTime()}` });
    alert(`Error: ${error}`);
  }
}
