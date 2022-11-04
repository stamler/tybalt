<template>
  <div id="list">
    <div class="listentry" v-for="item in items" v-bind:key="item.id">
      <div class="anchorbox">
        {{ exportDate(item.payPeriodEnding.toDate()) }}
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline"></div>
          <div class="byline"></div>
        </div>
        <div class="firstline" v-if="hasPending(item)">
          {{ Object.keys(item.pending).length }} time sheet(s) pending
        </div>
        <div class="secondline" v-if="hasLocked(item)">
          {{ Object.keys(item.timeSheets).length }} locked time sheet(s)
        </div>
        <div class="thirdline" v-if="hasSubmitted(item)">
          {{ Object.keys(item.submitted).length }} submitted time sheet(s)
          awaiting manager approval
        </div>
      </div>
      <div class="rowactionsbox">
        <action-button
          type="download"
          @click="generateSQLPayrollCSVForWeek(item.payPeriodEnding, true)"
        >
          week1SQL
        </action-button>
        <action-button
          type="download"
          @click="generateSQLPayrollCSVForWeek(item.payPeriodEnding)"
        >
          week2SQL
        </action-button>
        <action-button
          v-if="hasLink(item, 'week1TimeJson')"
          type="download"
          @click="generatePayrollCSV(item['week1TimeJson'])"
        >
          week1
        </action-button>
        <action-button
          v-if="hasLink(item, 'week2TimeJson')"
          type="download"
          @click="generatePayrollCSV(item['week2TimeJson'])"
        >
          week2
        </action-button>
        <!--
        REMOVED AND REPLACED WITH generatePayablesCSVSQL
          <action-button
            v-if="Object.keys(item.expenses).length > 0"
            type="download"
            @click="
              generatePayablesCSV(
                getPayPeriodExpenses(item.payPeriodEnding.toDate())
              ).then(() => generateAttachmentZip(item))
            "
          >
            expenses
          </action-button>
        -->
        <action-button
          type="download"
          @click="
            generatePayablesCSVSQL(item.payPeriodEnding, 'payroll').then(() =>
              generateAttachmentZip(item)
            )
          "
        >
          expensesSQL
        </action-button>
        <a v-if="hasLink(item, 'zip')" download v-bind:href="item['zip']">
          attachments.zip<download-icon></download-icon>
        </a>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from "vue";
import {
  generatePayablesCSVSQL,
  downloadBlob,
  exportDate,
  exportDateWeekStart,
  foldAmendments,
} from "./helpers";
import { format, subDays } from "date-fns";
import { useStateStore } from "../stores/state";
import { utcToZonedTime } from "date-fns-tz";
import {
  PayrollReportRecord,
  isTimeSheet,
  TimeSheet,
  Amendment,
  TimeOffTypes,
} from "./types";
import ActionButton from "./ActionButton.vue";
import { DownloadIcon } from "vue-feather-icons";
import firebase from "../firebase";
import { parse } from "json2csv";
import _ from "lodash";
const db = firebase.firestore();

export default Vue.extend({
  setup() {
    const store = useStateStore();
    const { startTask, endTask } = store;
    return { startTask, endTask };
  },
  props: ["collection"], // a string, the Firestore Collection name
  components: {
    ActionButton,
    DownloadIcon,
  },
  data() {
    return {
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      items: [] as firebase.firestore.DocumentData[],
    };
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.$bind(
      "items",
      this.collectionObject.orderBy("payPeriodEnding", "desc")
    ).catch((error: unknown) => {
      if (error instanceof Error) {
        alert(`Can't load ${this.collection}: ${error.message}`);
      } else alert(`Can't load ${this.collection}: ${JSON.stringify(error)}`);
    });
  },
  methods: {
    generatePayablesCSVSQL,
    downloadBlob,
    exportDate,
    exportDateWeekStart,
    foldAmendments,
    hasLink(item: firebase.firestore.DocumentData, property: string) {
      return (
        Object.prototype.hasOwnProperty.call(item, property) &&
        item[property].length > 32
      );
    },
    hasSubmitted(item: firebase.firestore.DocumentData) {
      return (
        Object.prototype.hasOwnProperty.call(item, "submitted") &&
        Object.keys(item.submitted).length > 0
      );
    },
    hasPending(item: firebase.firestore.DocumentData) {
      return (
        Object.prototype.hasOwnProperty.call(item, "pending") &&
        Object.keys(item.pending).length > 0
      );
    },
    hasLocked(item: firebase.firestore.DocumentData) {
      return (
        Object.prototype.hasOwnProperty.call(item, "timeSheets") &&
        Object.keys(item.timeSheets).length > 0
      );
    },
    // This method attempts to coerce a value into a number. If it cannot it
    // returns false
    tryToMakeNumber(input: null | string | number | undefined) {
      switch (typeof input) {
        case "number":
          return input;
        case "object":
          return false; // null case
        case "undefined":
          return false; // undefined case
      }
      if (typeof input !== "string") return false;
      const candidate = input.trim(); // it's a string with no leading or trailing whitespace
      if (candidate.length < 1) return false; // it's a blank string
      return !isNaN(Number(candidate)) ? Number(candidate) : input;
    },
    async generateSQLPayrollCSVForWeek(
      timestamp: firebase.firestore.Timestamp,
      week1 = false
    ) {
      let weekEndingTbay = utcToZonedTime(
        timestamp.toDate(),
        "America/Thunder_Bay"
      );
      if (week1) {
        // must calculate the week1 ending and run the query
        weekEndingTbay = subDays(
          utcToZonedTime(timestamp.toDate(), "America/Thunder_Bay"),
          7
        );
      }
      const queryValues = [format(weekEndingTbay, "yyyy-MM-dd")];
      const queryMySQL = firebase.functions().httpsCallable("queryMySQL");
      try {
        const response = await queryMySQL({
          queryName: "payrollReport-FoldedAmendments",
          queryValues,
        });
        /*
        // Use this code if decimalNumbers: true isn't set in mysql2 config to
        // attempt to coerce every returned value into a number (inelegant)
        // https://github.com/sidorares/node-mysql2/tree/master/documentation#known-incompatibilities-with-node-mysql
        const dat = response.data.map((x: any) => {
          const processed: Record<string,any> = {};
          for (const k of Object.keys(x)) {
            const a = this.tryToMakeNumber(x[k]);
            console.log(a);
            processed[k] = a === false ? x[k] : a;
          }
          return processed;
        });
        console.log(JSON.stringify(dat));
        const csv = parse(dat);
        */
        // post-processing of response data for CSV conversion
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dat = response.data.map((x: any) => {
          const processed = x;
          // set salary (string) to boolean
          processed.salary = x.salary === 0 ? false : true;
          // Coerce number-like payrollID strings to numbers
          if (isNaN(x.tbtePayrollId)) return processed; // string payroll ID
          processed.tbtePayrollId = Number(x.tbtePayrollId);
          return processed;
        });
        const csv = parse(dat);
        const blob = new Blob([csv], { type: "text/csv" });
        this.downloadBlob(
          blob,
          `SQLpayroll_${this.exportDateWeekStart(
            weekEndingTbay
          )}-${this.exportDate(weekEndingTbay)}.csv`
        );
      } catch (error) {
        alert(`Error: ${error}`);
      }
    },
    async generatePayrollCSV(url: string) {
      const response = await fetch(url);
      const inputObject = (await response.json()) as (TimeSheet | Amendment)[];
      const { timesheets: items, amendments } =
        this.foldAmendments(inputObject);

      // since all entries have the same week ending, pull from the first entry
      let weekEnding;
      if (items.length > 0) {
        weekEnding = new Date(items[0].weekEnding);
      } else {
        weekEnding = new Date(amendments[0].committedWeekEnding);
      }
      const fields = [
        "tbtePayrollId",
        "weekEnding",
        {
          label: "surname",
          value: "surname",
        },
        {
          label: "givenName",
          value: "givenName",
        },
        {
          label: "name",
          value: "displayName",
        },
        {
          label: "manager",
          value: "managerName",
        },
        {
          label: "meals",
          value: "mealsHoursTally",
        },
        {
          label: "days off rotation",
          value: "offRotationDaysTally",
        },
        {
          label: "hours worked",
          value: "R",
        },
        {
          label: "salaryHoursOver44",
          value: (row: PayrollReportRecord) => {
            if (row.salary && row.R) {
              return row.R > 44 ? row.R - 44 : 0;
            }
            return 0;
          },
        },
        {
          label: "adjustedHoursWorked",
          value: (row: PayrollReportRecord) => {
            const reg = row.R || 0;
            if (row.salary) {
              const stat = row.OH || 0;
              const bereavement = row.OB || 0;
              const workWeekHours = row.workWeekHours || 40;
              return reg + stat + bereavement > workWeekHours
                ? workWeekHours - stat - bereavement
                : reg;
            } else {
              return reg > 44 ? 44 : reg;
            }
          },
        },
        {
          label: "total overtime hours",
          value: (row: PayrollReportRecord) => {
            if (!row.salary) {
              const reg = row.R || 0;
              return reg > 44 ? reg - 44 : 0;
            }
            return 0;
          },
        },
        {
          label: "overtime hours to pay",
          value: (row: PayrollReportRecord) => {
            if (!row.salary) {
              const reg = row.R || 0;
              const ot = reg > 44 ? reg - 44 : 0;
              const rb = row.RB || 0;
              return rb > 0 ? ot - rb : ot;
            }
            return 0;
          },
        },
        {
          label: "Bereavement",
          value: "OB",
        },
        {
          label: "Stat Holiday",
          value: "OH",
        },
        {
          label: "PPTO",
          value: "OP",
        },
        {
          label: "Sick",
          value: "OS",
        },
        {
          label: "Vacation",
          value: "OV",
        },
        {
          label: "overtime hours to bank",
          value: "RB",
        },
        {
          label: "Overtime Payout Requested",
          value: "payoutRequest",
        },
        {
          label: "hasAmendmentsForWeeksEnding",
          value: (row: PayrollReportRecord) => {
            if (Array.isArray(row.hasAmendmentsForWeeksEnding)) {
              const deduplicated = Array.from(
                new Set(row.hasAmendmentsForWeeksEnding)
              );
              const dates = deduplicated.map((x) =>
                format(
                  utcToZonedTime(new Date(x), "America/Thunder_Bay"),
                  "yyyy MMM dd"
                )
              );
              return dates;
            }
            return "";
          },
        },
        "salary",
      ];
      const opts = { fields, withBOM: true };
      const timesheetRecords = items.map(
        (x: firebase.firestore.DocumentData) => {
          if (!isTimeSheet(x)) {
            throw new Error(
              "(Payroll)There was an error validating the timesheet"
            );
          }
          const item = _.pick(x, [
            "weekEnding",
            "surname",
            "givenName",
            "displayName",
            "managerName",
            "mealsHoursTally",
            "offRotationDaysTally",
            "payoutRequest",
            "hasAmendmentsForWeeksEnding",
            "salary",
            "tbtePayrollId",
          ]) as PayrollReportRecord;
          item.weekEnding = format(
            utcToZonedTime(new Date(item.weekEnding), "America/Thunder_Bay"),
            "yyyy MMM dd"
          );
          item.R = x.workHoursTally.jobHours + x.workHoursTally.hours;
          item.RB = x.bankedHours;
          for (const key in x.nonWorkHoursTally) {
            item[key as TimeOffTypes] = x.nonWorkHoursTally[key];
          }
          return item;
        }
      );
      const amendmentRecords = amendments.map((x: Amendment) => {
        const item: PayrollReportRecord = {
          hasAmendmentsForWeeksEnding: [x.weekEnding],
          weekEnding: x.committedWeekEnding,
          displayName: x.displayName,
          surname: x.surname,
          givenName: x.givenName,
          managerName: x.creatorName,
          mealsHoursTally: x.mealsHours || 0,
          salary: x.salary,
          tbtePayrollId: x.tbtePayrollId,
        };
        if (["R", "RT"].includes(x.timetype)) {
          item["R"] = (x.hours || 0) + (x.jobHours || 0);
        } else {
          if (!x.hours) {
            throw new Error(
              "generatePayrollCSV: The Amendment is of type nonWorkHours but no hours are present"
            );
          }
          item[x.timetype as TimeOffTypes] = x.hours;
        }

        return item;
      });
      // Sort the records by tbtePayrollId ascending
      const joined: PayrollReportRecord[] =
        timesheetRecords.concat(amendmentRecords);
      joined.sort((a, b) => {
        const aval = Number(a.tbtePayrollId);
        const bval = Number(b.tbtePayrollId);
        if (!isNaN(aval) && !isNaN(bval)) return aval - bval;
        if (!isNaN(aval)) return -1;
        if (!isNaN(bval)) return 1;
        return 0;
      });
      const csv = parse(joined, opts);
      const blob = new Blob([csv], { type: "text/csv" });
      this.downloadBlob(
        blob,
        `payroll_${this.exportDateWeekStart(weekEnding)}-${this.exportDate(
          weekEnding
        )}.csv`
      );
    },
    async generateAttachmentZip(item: firebase.firestore.DocumentData) {
      const generateExpenseAttachmentArchive = firebase
        .functions()
        .httpsCallable("generateExpenseAttachmentArchive");
      const payPeriodEnding = item.payPeriodEnding.toDate().getTime();
      if (item.zip !== undefined) {
        return;
      }
      this.startTask({
        id: `generateAttachments${payPeriodEnding}`,
        message: "Generating Attachments",
      });
      try {
        await generateExpenseAttachmentArchive({ payPeriodEnding });
      } catch (error) {
        alert(error);
      }
      this.endTask(`generateAttachments${payPeriodEnding}`);
    },
    // REMOVED AND REPLACED WITH generatePayablesCSVSQL
    // async getPayPeriodExpenses(week: Date) {
    //   const getPayPeriodExpenses = firebase
    //     .functions()
    //     .httpsCallable("getPayPeriodExpenses");
    //   try {
    //     store.commit("startTask", {
    //       id: `getExpenses${week.getTime()}`,
    //       message: "Getting Expenses",
    //     });
    //     const result = await getPayPeriodExpenses({
    //       weekEnding: week.getTime(),
    //     });
    //     store.commit("endTask", { id: `getExpenses${week.getTime()}` });
    //     return result.data;
    //     /*
    //     const blob = new Blob([JSON.stringify(result.data)], {
    //       type: "application/json;charset=utf-8",
    //     });
    //     this.downloadBlob(blob, "expenses.json", true);
    //     */
    //   } catch (error) {
    //     store.commit("endTask", { id: `getExpenses${week.getTime()}` });
    //     alert(`Error getting expenses: ${error}`);
    //   }
    // },
  },
});
</script>
