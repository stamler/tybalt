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
          week1
        </action-button>
        <action-button
          type="download"
          @click="generateSQLPayrollCSVForWeek(item.payPeriodEnding)"
        >
          week2
        </action-button>
        <!-- <action-button
          v-if="hasLink(item, 'week1TimeJson')"
          type="download"
          @click="generatePayrollCSV(item['week1TimeJson'])"
        >
          week1
        </action-button> -->
        <!-- <action-button
          v-if="hasLink(item, 'week2TimeJson')"
          type="download"
          @click="generatePayrollCSV(item['week2TimeJson'])"
        >
          week2
        </action-button> -->
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
          expenses
        </action-button>
        <a v-if="hasLink(item, 'zip')" download v-bind:href="item['zip']">
          attachments.zip<Icon icon="feather:download" width="24px" />
        </a>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
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
// import {
//   PayrollReportRecord,
//   isTimeSheet,
//   TimeSheet,
//   Amendment,
//   TimeOffTypes,
// } from "./types";
import ActionButton from "./ActionButton.vue";
import { Icon } from "@iconify/vue";
import { firebaseApp } from "../firebase";
import {
  Timestamp,
  getFirestore,
  collection,
  CollectionReference,
  DocumentData,
  query,
  orderBy,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { parse } from "json2csv";
// import _ from "lodash";
const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp);

export default defineComponent({
  setup() {
    const store = useStateStore();
    const { startTask, endTask } = store;
    return { startTask, endTask };
  },
  props: ["collectionName"], // a string, the Firestore Collection name
  components: {
    ActionButton,
    Icon,
  },
  data() {
    return {
      parentPath: "",
      collectionObject: null as CollectionReference | null,
      items: [] as DocumentData[],
    };
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
    this.collectionObject = collection(db, this.collectionName);
    this.$firestoreBind(
      "items",
      query(this.collectionObject, orderBy("payPeriodEnding", "desc"))
    ).catch((error: unknown) => {
      if (error instanceof Error) {
        alert(`Can't load ${this.collectionName}: ${error.message}`);
      } else
        alert(`Can't load ${this.collectionName}: ${JSON.stringify(error)}`);
    });
  },
  methods: {
    generatePayablesCSVSQL,
    downloadBlob,
    exportDate,
    exportDateWeekStart,
    foldAmendments,
    hasLink(item: DocumentData, property: string) {
      return (
        Object.prototype.hasOwnProperty.call(item, property) &&
        item[property].length > 32
      );
    },
    hasSubmitted(item: DocumentData) {
      return (
        Object.prototype.hasOwnProperty.call(item, "submitted") &&
        Object.keys(item.submitted).length > 0
      );
    },
    hasPending(item: DocumentData) {
      return (
        Object.prototype.hasOwnProperty.call(item, "pending") &&
        Object.keys(item.pending).length > 0
      );
    },
    hasLocked(item: DocumentData) {
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
    async generateSQLPayrollCSVForWeek(timestamp: Timestamp, week1 = false) {
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
      const queryMySQL = httpsCallable(functions, "queryMySQL");
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
        const dat = (response.data as Array<any>).map((x: any) => {
          const processed = x;
          // set salary (string) to boolean
          processed.salary = x.salary === 0 ? false : true;
          // Coerce number-like payrollID strings to numbers
          if (isNaN(x.payrollId)) return processed; // string payroll ID
          processed.payrollId = Number(x.payrollId);
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

    async generateAttachmentZip(item: DocumentData) {
      const generateExpenseAttachmentArchive = httpsCallable(
        functions,
        "generateExpenseAttachmentArchive"
      );
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
