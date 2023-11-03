<template>
  <DSList v-if="itemsQuery !== null" :query="itemsQuery" :search="true">
    <template #anchor="{ payPeriodEnding }">
      {{ exportDate(payPeriodEnding.toDate()) }}
    </template>
    <template #headline="{ name }">{{ name }}</template>
    <template #line1="item">
      <span v-if="hasPending(item)">
        {{ Object.keys(item.pending).length }} time sheet(s) pending
      </span>
    </template>
    <template #line2="item">
      <span v-if="hasLocked(item)">
        {{ Object.keys(item.timeSheets).length }} locked time sheet(s)
      </span>
    </template>
    <template #line3="item">
      <span v-if="hasSubmitted(item)">
        {{ Object.keys(item.submitted).length }} submitted time sheet(s)
          awaiting manager approval
      </span>
    </template>
    <template #actions="item">
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
      <action-button
        type="download"
        @click="
          generatePayablesCSVSQL(item.payPeriodEnding, 'payroll').then(() =>
            generateAttachmentZip(item, 'payPeriod')
          )
        "
      >
        expenses
      </action-button>
      <a v-if="hasLink(item, 'zip')" download v-bind:href="item['zip']">
        receipts<Icon icon="feather:download" width="24px" />
      </a>
      <!-- Regenerate the attachments file -->
      <action-button
        v-if="hasLink(item, 'zip')"
        type="refresh"
        @click="generateAttachmentZip(item, 'payPeriod', true)"
      />
    </template>
  </DSList>
</template>

<script setup lang="ts">
import DSList from "./DSList.vue";
import { ref } from "vue";
import {
  generatePayablesCSVSQL,
  downloadBlob,
  exportDate,
  exportDateWeekStart,
  hasLink,
  generateAttachmentZip,
} from "./helpers";
import { format, subDays } from "date-fns";
import { utcToZonedTime } from "date-fns-tz";
import ActionButton from "./ActionButton.vue";
import { Icon } from "@iconify/vue";
import { firebaseApp } from "../firebase";
import {
  Timestamp,
  getFirestore,
  collection,
  DocumentData,
  query,
  orderBy,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Parser } from "@json2csv/plainjs";
import { APP_NATIVE_TZ } from "../config";

const functions = getFunctions(firebaseApp);

const itemsQuery = ref(
  query(collection(getFirestore(firebaseApp), "PayrollTracking"), orderBy("payPeriodEnding", "desc"))
);

const hasSubmitted = function (item: DocumentData) {
  return (
    Object.prototype.hasOwnProperty.call(item, "submitted") &&
    Object.keys(item.submitted).length > 0
  );
};
const hasPending = function (item: DocumentData) {
  return (
    Object.prototype.hasOwnProperty.call(item, "pending") &&
    Object.keys(item.pending).length > 0
  );
};
const hasLocked = function (item: DocumentData) {
  return (
    Object.prototype.hasOwnProperty.call(item, "timeSheets") &&
    Object.keys(item.timeSheets).length > 0
  );
};

// This method attempts to coerce a value into a number. If it cannot it
// returns false
const tryToMakeNumber = function (input: null | string | number | undefined) {
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
};

const generateSQLPayrollCSVForWeek = async function (timestamp: Timestamp, week1 = false) {
  let weekEndingZoned = utcToZonedTime(timestamp.toDate(), APP_NATIVE_TZ);
  if (week1) {
    // must calculate the week1 ending and run the query
    weekEndingZoned = subDays(
      utcToZonedTime(timestamp.toDate(), APP_NATIVE_TZ),
      7
    );
  }
  const queryValues = [format(weekEndingZoned, "yyyy-MM-dd")];
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
    const parser = new Parser();
    const csv = parser.parse(dat);
    const blob = new Blob([csv], { type: "text/csv" });
    downloadBlob(
      blob,
      `SQLpayroll_${exportDateWeekStart(
        weekEndingZoned
      )}-${exportDate(weekEndingZoned)}.csv`
    );
  } catch (error) {
    alert(`Error: ${error}`);
  }
};
</script>
