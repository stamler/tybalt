<template>
  <div id="list">
    <div class="listentry" v-for="item in items" v-bind:key="item.id">
      <div class="anchorbox">
        {{ item.payPeriodEnding.toDate() | exportDate }}
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
        <router-link
          v-if="hasLink(item, 'week1TimeJson')"
          v-bind:to="{ name: 'Payroll' }"
          v-on:click.native="generatePayrollCSV(item['week1TimeJson'])"
        >
          week1 <download-icon></download-icon>
        </router-link>
        <router-link
          v-if="hasLink(item, 'week2TimeJson')"
          v-bind:to="{ name: 'Payroll' }"
          v-on:click.native="generatePayrollCSV(item['week2TimeJson'])"
        >
          week2 <download-icon></download-icon>
        </router-link>
        <router-link
          v-if="Object.keys(item.expenses).length > 0"
          v-bind:to="{ name: 'Payroll' }"
          v-on:click.native="
            generatePayPeriodExpenses(item.payPeriodEnding.toDate())
          "
        >
          expenseJson<download-icon></download-icon>
        </router-link>
        <a v-if="hasLink(item, 'zip')" download v-bind:href="item['zip']">
          attachments.zip<download-icon></download-icon>
        </a>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import mixins from "./mixins";
import { format } from "date-fns";
import { utcToZonedTime } from "date-fns-tz";
import {
  PayrollReportRecord,
  isTimeSheet,
  TimeSheet,
  Amendment,
  TimeOffTypes,
} from "./types";
import { LockIcon, DownloadIcon } from "vue-feather-icons";
import firebase from "../firebase";
import { parse } from "json2csv";
import _ from "lodash";
const db = firebase.firestore();

export default mixins.extend({
  props: ["collection"], // a string, the Firestore Collection name
  components: {
    LockIcon,
    DownloadIcon,
  },
  filters: {
    exportDate(date: Date) {
      return format(date, "yyyy MMM dd");
    },
  },
  data() {
    return {
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      items: [],
    };
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.$bind(
      "items",
      this.collectionObject.orderBy("payPeriodEnding", "desc")
    ).catch((error) => {
      alert(`Can't load ${this.collection}: ${error.message}`);
    });
  },
  methods: {
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
    async generatePayrollCSV(url: string) {
      const response = await fetch(url);
      const inputObject = (await response.json()) as (TimeSheet | Amendment)[];
      const { timesheets: items, amendments } = this.foldAmendments(
        inputObject
      );

      // since all entries have the same week ending, pull from the first entry
      let weekEnding;
      if (items.length > 0) {
        weekEnding = new Date(items[0].weekEnding);
      } else {
        weekEnding = new Date(amendments[0].committedWeekEnding);
      }
      const fields = [
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
              return reg + stat + bereavement > 40
                ? 40 - stat - bereavement
                : reg;
            } else {
              return reg > 44 ? 44 : reg;
            }
          },
        },
        {
          label: "overtime",
          value: (row: PayrollReportRecord) => {
            if (!row.salary) {
              const reg = row.R || 0;
              return reg > 44 ? reg - 44 : 0;
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
        "hasAmendmentsForWeeksEnding",
        "salary",
        "tbtePayrollId",
      ];
      const opts = { fields };
      const timesheetRecords = items.map((x) => {
        if (!isTimeSheet(x)) {
          throw new Error("There was an error validating the timesheet");
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
      });
      const amendmentRecords = amendments.map((x) => {
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
        if (x.timetype === "R") {
          item["R"] = (x.hours || 0) + (x.jobHours || 0);
        } else {
          if (!x.hours) {
            throw new Error(
              "The Amendment is of type nonWorkHours but no hours are present"
            );
          }
          item[x.timetype as TimeOffTypes] = x.hours;
        }

        return item;
      });
      const csv = parse(timesheetRecords.concat(amendmentRecords), opts);
      const blob = new Blob([csv], { type: "text/csv" });
      this.downloadBlob(
        blob,
        `payroll_${this.exportDateWeekStart(weekEnding)}-${this.exportDate(
          weekEnding
        )}.csv`
      );
    },
    async generatePayPeriodExpenses(week: Date) {
      const getPayPeriodExpenses = firebase
        .functions()
        .httpsCallable("getPayPeriodExpenses");
      try {
        const result = await getPayPeriodExpenses({
          weekEnding: week.getTime(),
        });
        const blob = new Blob([JSON.stringify(result.data)], {
          type: "application/json;charset=utf-8",
        });
        this.downloadBlob(blob, "expenses.json", true);
      } catch (error) {
        alert(`Error getting expenses: ${error}`);
      }
    },
  },
});
</script>
