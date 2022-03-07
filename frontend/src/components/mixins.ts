import Vue from "vue";
import { mapState } from "vuex";
import firebase from "../firebase";
import store from "../store";
import { format, subDays, addDays } from "date-fns";
import { utcToZonedTime, zonedTimeToUtc } from "date-fns-tz";
import {
  TimeSheet,
  UnwoundTimeSheet,
  Amendment,
  isTimeSheet,
  Expense,
  ExpenseAllowance,
  isExpenseMeals,
  ExpenseMeals,
  isExpense,
} from "./types";
import {
  payPeriodsForYear as ppGen,
  isPayrollWeek2,
  nextSaturday,
  thisTimeNextWeekInTimeZone,
} from "./helpers";
import { parse } from "json2csv";
import { transforms } from "json2csv";

const db = firebase.firestore();
const storage = firebase.storage();
import _ from "lodash";

export default Vue.extend({
  data() {
    return {
      MILEAGE_RATE: 0.5, // dollars per km
      BREAKFAST_RATE: 15, // dollars per meal
      LUNCH_RATE: 20, // dollars per meal
      DINNER_RATE: 20, // dollars per meal
      LODGING_RATE: 50, // dollars for personal lodging reimbursement
    };
  },
  computed: {
    ...mapState(["claims", "user"]),
  },
  methods: {
    // returns Date[] of all pay periods in the given year
    payPeriodsForYear(year: number): Date[] {
      return Array.from(ppGen(year));
    },
    // return the same time 7 days ago in the given time zone
    thisTimeLastNWeeksInTimeZone(datetime: Date, timezone: string, n: number) {
      const zone_time = utcToZonedTime(datetime, timezone);
      return zonedTimeToUtc(subDays(zone_time, 7 * n), timezone);
    },
    thisTimeNextWeekInTimeZone,
    nextSaturday,
    copyEntry(
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
    },
    calculatedOntarioHST(total: number): number {
      return Math.round((total * 1300) / 113) / 100;
    },
    calculatedAllowanceAmount(row: ExpenseAllowance | ExpenseMeals) {
      if (isExpenseMeals(row)) {
        return (
          (row.breakfast ? this.BREAKFAST_RATE : 0) +
          (row.lunch ? this.LUNCH_RATE : 0) +
          (row.dinner ? this.DINNER_RATE : 0)
        );
      }
      return (
        (row.breakfast ? this.BREAKFAST_RATE : 0) +
        (row.lunch ? this.LUNCH_RATE : 0) +
        (row.dinner ? this.DINNER_RATE : 0) +
        (row.lodging ? this.LODGING_RATE : 0)
      );
    },
    bundle(week: Date) {
      store.commit("startTask", {
        id: "bundle",
        message: "verifying...",
      });
      const bundleTimesheet = firebase
        .functions()
        .httpsCallable("bundleTimesheet");
      return bundleTimesheet({ weekEnding: week.getTime() })
        .then(() => {
          store.commit("endTask", { id: "bundle" });
        })
        .catch((error) => {
          store.commit("endTask", { id: "bundle" });
          alert(`Error bundling timesheet: ${error.message}`);
        });
    },
    unbundle(timesheetId: string) {
      store.commit("startTask", { id: "unbundle", message: "unbundling" });
      const unbundleTimesheet = firebase
        .functions()
        .httpsCallable("unbundleTimesheet");
      return unbundleTimesheet({ id: timesheetId })
        .then(() => {
          store.commit("endTask", { id: "unbundle" });
        })
        .catch((error) => {
          store.commit("endTask", { id: "unbundle" });
          alert(`Error unbundling timesheet: ${error.message}`);
        });
    },
    submitExpense(expenseId: string) {
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
    },
    approveExpense(itemId: string) {
      store.commit("startTask", {
        id: `approve${itemId}`,
        message: "approving",
      });
      const item = db.collection("Expenses").doc(itemId);
      return db
        .runTransaction(function (transaction) {
          return transaction
            .get(item)
            .then((tsDoc: firebase.firestore.DocumentSnapshot) => {
              if (!tsDoc.exists) {
                throw `An expense with id ${itemId} doesn't exist.`;
              }
              const data = tsDoc?.data() ?? undefined;
              if (data !== undefined && data.submitted === true) {
                // timesheet is approvable because it has been submitted
                transaction.update(item, { approved: true, committed: false });
              } else {
                throw "The expense has not been submitted";
              }
            });
        })
        .then(() => {
          store.commit("endTask", { id: `approve${itemId}` });
        })
        .catch(function (error) {
          store.commit("endTask", { id: `approve${itemId}` });
          alert(`Approval failed: ${error}`);
        });
    },
    recallExpense(expenseId: string) {
      // A transaction is used to update the submitted field by
      // first verifying that approved is false. Similarly an approve
      // function for the approving manager must use a transaction and
      // verify that the timesheet is submitted before marking it approved
      store.commit("startTask", {
        id: `recall${expenseId}`,
        message: "recalling",
      });
      const expense = db.collection("Expenses").doc(expenseId);

      return db
        .runTransaction(function (transaction) {
          return transaction
            .get(expense)
            .then((tsDoc: firebase.firestore.DocumentSnapshot) => {
              if (!tsDoc.exists) {
                throw `An expense with id ${expenseId} doesn't exist.`;
              }
              const data = tsDoc?.data() ?? undefined;
              if (data !== undefined && data.approved === false) {
                // timesheet is recallable because it hasn't yet been approved
                transaction.update(expense, { submitted: false });
              } else {
                throw "The expense was already approved by a manager";
              }
            });
        })
        .then(() => {
          store.commit("endTask", { id: `recall${expenseId}` });
        })
        .catch(function (error) {
          store.commit("endTask", { id: `recall${expenseId}` });
          alert(`Recall failed: ${error}`);
        });
    },
    submitTs(timesheetId: string) {
      store.commit("startTask", {
        id: `submit${timesheetId}`,
        message: "submitting",
      });
      db.collection("TimeSheets")
        .doc(timesheetId)
        .set({ submitted: true }, { merge: true })
        .then(() => {
          store.commit("endTask", { id: `submit${timesheetId}` });
        })
        .catch((error) => {
          store.commit("endTask", { id: `submit${timesheetId}` });
          alert(`Error submitting timesheet: ${error}`);
        });
    },
    reviewTs(timesheetId: string) {
      store.commit("startTask", {
        id: `review${timesheetId}`,
        message: "marking reviewed",
      });
      db.collection("TimeSheets")
        .doc(timesheetId)
        .update({
          reviewedIds: firebase.firestore.FieldValue.arrayUnion(this.user.uid),
        })
        .then(() => {
          store.commit("endTask", { id: `review${timesheetId}` });
        })
        .catch((error) => {
          store.commit("endTask", { id: `review${timesheetId}` });
          alert(`Error marking timesheet as reviewed: ${error}`);
        });
    },
    approveTs(timesheetId: string) {
      store.commit("startTask", {
        id: `approve${timesheetId}`,
        message: "approving",
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
              if (data !== undefined && data.submitted === true) {
                // timesheet is approvable because it has been submitted
                transaction.update(timesheet, { approved: true });
              } else {
                throw "The timesheet has not been submitted";
              }
            });
        })
        .then(() => {
          store.commit("endTask", { id: `approve${timesheetId}` });
        })
        .catch(function (error) {
          store.commit("endTask", { id: `approve${timesheetId}` });
          alert(`Approval failed: ${error}`);
        });
    },
    recallTs(timesheetId: string) {
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
          return this.unbundle(timesheetId);
        })
        .catch(function (error) {
          store.commit("endTask", { id: `recall${timesheetId}` });
          alert(`Recall failed: ${error}`);
        });
    },
    hasPermission(claim: string): boolean {
      return (
        Object.prototype.hasOwnProperty.call(this.claims, claim) &&
        this.claims[claim] === true
      );
    },
    searchString(item: firebase.firestore.DocumentData) {
      const fields = Object.values(item);
      fields.push(item.id);
      return fields.join(",").toLowerCase();
    },
    del(
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
    },
    async downloadAttachment(
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
    },
    // Force the download of a blob to a file by creating an
    // anchor and programmatically clicking it.
    downloadBlob(blob: Blob, filename: string, inline = false) {
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
    },
    exportDateWeekStart(date: Date) {
      const startDate = subDays(date, 6);
      return format(startDate, "yyyy MMM dd");
    },
    exportDate(date: Date) {
      return format(date, "yyyy MMM dd");
    },
    // If an amendment has a corresponding timesheet, fold it into that
    // timesheet and update the tallies for that timesheet. Otherwise
    // just return the amendment by itself. Returns an object with a
    // timesheets property whose value is an array of timesheets and
    // an amendments property whose value is amendments that didn't have a
    // corresponding timesheet.
    foldAmendments(items: (TimeSheet | Amendment)[]) {
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
    },
    isPayrollWeek2,
    async generateSQLJobSummaryCSV(job: string, allDashes = false) {
      const queryValues = [job];
      const queryMySQL = firebase.functions().httpsCallable("queryMySQL");
      try {
        const queryName = allDashes ? "jobReport-startsWith" : "jobReport";
        const response = await queryMySQL({
          queryName,
          queryValues,
        });
        const csv = parse(response.data);
        const blob = new Blob([csv], { type: "text/csv" });
        this.downloadBlob(blob, `${job}_JobSummary.csv`);
      } catch (error) {
        alert(`Error: ${error}`);
      }
    },
    async generatePayablesCSV(
      urlOrExpenseArrayPromise: string | Promise<Expense[]>
    ) {
      // We assume that string arguments are for weekly reports and promise
      // arguments are for payroll-oriented reports. The only difference is the
      // range of dates which are included in the report
      let payroll = false;

      let items;
      let weekEnding;
      if (typeof urlOrExpenseArrayPromise === "string") {
        const response = await fetch(urlOrExpenseArrayPromise);
        items = (await response.json()) as Expense[];
        // since all entries have the same week ending, pull from the first entry
        weekEnding = new Date(items[0].committedWeekEnding);
      } else {
        const result = await Promise.resolve(urlOrExpenseArrayPromise);
        if (Array.isArray(result)) {
          items = result;
          // since all entries have the same week ending, pull from the first entry
          weekEnding = new Date(items[0].payPeriodEnding);
          payroll = true;
        } else {
          throw new Error(
            "The provided promise doesn't resolve an array or a string"
          );
        }
      }

      const fields = [
        "tbtePayrollId",
        {
          label: "Acct/Visa/Exp",
          value: "paymentType",
        },
        {
          label: "Job #",
          value: "job",
        },
        {
          label: "Client",
          value: "client",
        },
        {
          label: "Job Description",
          value: "jobDescription",
        },
        {
          label: "Div",
          value: "division",
        },
        {
          label: "Date",
          value: (row: Expense) => new Date(row.date).getDate(),
        },
        {
          label: "Month",
          value: (row: Expense) =>
            new Date(row.date).toLocaleString("en-US", { month: "short" }),
        },
        {
          label: "Year",
          value: (row: Expense) => new Date(row.date).getFullYear(),
        },
        {
          label: "calculatedSubtotal",
          value: (row: Expense) => {
            switch (row.paymentType) {
              case "Mileage": {
                const total = row.distance * this.MILEAGE_RATE;
                return total - this.calculatedOntarioHST(total);
              }
              case "Allowance":
              case "Meals": {
                const total = this.calculatedAllowanceAmount(row);
                return total - this.calculatedOntarioHST(total);
              }
              default:
                return row.total - this.calculatedOntarioHST(row.total);
            }
          },
        },
        {
          label: "calculatedOntarioHST",
          value: (row: Expense) => {
            switch (row.paymentType) {
              case "Mileage":
                return this.calculatedOntarioHST(
                  row.distance * this.MILEAGE_RATE
                );
              case "Allowance":
              case "Meals":
                return this.calculatedOntarioHST(
                  this.calculatedAllowanceAmount(row)
                );
              default:
                return this.calculatedOntarioHST(row.total);
            }
          },
        },
        {
          label: "Total",
          value: (row: Expense) => {
            switch (row.paymentType) {
              case "Mileage":
                return row.distance * this.MILEAGE_RATE;
              case "Allowance":
              case "Meals":
                return this.calculatedAllowanceAmount(row);
              default:
                return row.total;
            }
          },
        },
        {
          label: "PO#",
          value: "po",
        },
        {
          label: "Description",
          value: (row: Expense) => {
            const description = "";
            switch (row.paymentType) {
              case "Allowance":
                return description.concat(
                  row.breakfast === true ? "Breakfast " : "",
                  row.lunch === true ? "Lunch " : "",
                  row.dinner === true ? "Dinner " : "",
                  row.lodging === true ? "Lodging " : ""
                );
              case "Meals":
                return description.concat(
                  row.breakfast === true ? "Breakfast " : "",
                  row.lunch === true ? "Lunch " : "",
                  row.dinner === true ? "Dinner " : ""
                );
              default:
                return row.description;
            }
          },
        },
        {
          label: "Company",
          value: "vendorName",
        },
        {
          label: "Employee",
          value: "displayName",
        },
        {
          label: "Approved By",
          value: "managerName",
        },
      ];
      const opts = { fields, withBOM: true };
      const expenseRecords = items.map((x) => {
        if (!isExpense(x)) {
          throw new Error("There was an error validating the expense");
        }
        x["committedWeekEnding"] = format(
          utcToZonedTime(
            new Date(x.committedWeekEnding),
            "America/Thunder_Bay"
          ),
          "yyyy MMM dd"
        );
        return x;
      });
      const csv = parse(expenseRecords, opts);
      const blob = new Blob([csv], { type: "text/csv" });
      if (payroll) {
        this.downloadBlob(
          blob,
          `ExpensesForPayPeriod${this.exportDateWeekStart(
            subDays(weekEnding, 7)
          )}-${this.exportDate(weekEnding)}.csv`
        );
      } else {
        this.downloadBlob(
          blob,
          `payables_${this.exportDateWeekStart(weekEnding)}-${this.exportDate(
            weekEnding
          )}.csv`
        );
      }
    },
    async generateTimeReportCSV(
      urlOrFirestoreTimeSheet: string | firebase.firestore.DocumentData
    ) {
      let items: (TimeSheet | Amendment)[];
      let amendments: Amendment[];
      let firestoreDoc = false;
      if (typeof urlOrFirestoreTimeSheet === "string") {
        // the arg is a url for a json document
        const response = await fetch(urlOrFirestoreTimeSheet);
        const inputObject = (await response.json()) as (
          | TimeSheet
          | Amendment
        )[];
        const { timesheets, amendments: amendmentsInIf } =
          this.foldAmendments(inputObject);
        items = timesheets;
        amendments = amendmentsInIf;
      } else {
        // the arg is firestore DocumentData. Convert timestamps to JS dates
        firestoreDoc = true;
        if (!isTimeSheet(urlOrFirestoreTimeSheet)) {
          throw new Error("(mixins1)There was an error validating the timesheet");
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
          throw new Error("(mixins2)There was an error validating the timesheet");
        }
        for (const entry of item.entries) {
          //if (!["R", "RT"].includes(entry.timetype)) continue;
          // TODO: verify that time zone conversion isn't needed here
          const date = new Date(
            firestoreDoc ? entry.date.toDate() : entry.date
          );
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
      const filename = `time_report_${this.exportDateWeekStart(
        weekEnding
      )}-${this.exportDate(weekEnding)}.csv`;
      this.downloadBlob(
        blob,
        firestoreDoc ? items[0].displayName + "-" + filename : filename
      );
    },
  },
});
