<template>
  <div>
    <p v-if="committedTimesheetCountsError">
      {{ committedTimesheetCountsError }}
    </p>
    <DSList v-if="itemsQuery !== null" :query="itemsQuery" :search="true">
      <template #anchor="{ payPeriodEnding }">
        {{ exportDate(payPeriodEnding.toDate()) }}
      </template>
      <template #headline="{ name }">{{ name }}</template>
      <template #line1="item">
        {{ getCommittedTimesheetCount(item) }} committed time sheet(s)
      </template>
      <template #line2="item">
        {{ getCommittedExpenseCount(item) }} committed expense(s)
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
  </div>
</template>

<script setup lang="ts">
import DSList from "./DSList.vue";
import { onMounted, onUnmounted, ref } from "vue";
import {
  generatePayablesCSVSQL,
  downloadBlob,
  exportDate,
  exportDateWeekStart,
  hasLink,
  generateAttachmentZip,
} from "./helpers";
import { addMilliseconds, format, subDays, subMilliseconds } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import ActionButton from "./ActionButton.vue";
import { Icon } from "@iconify/vue";
import { firebaseApp } from "../firebase";
import {
  Timestamp,
  getDocs,
  getFirestore,
  collection,
  DocumentData,
  onSnapshot,
  query,
  orderBy,
  QueryDocumentSnapshot,
  QuerySnapshot,
  where,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Parser } from "@json2csv/plainjs";
import { APP_NATIVE_TZ } from "../config";

const functions = getFunctions(firebaseApp);
const db = getFirestore(firebaseApp);
const committedTimesheetCounts = ref<Record<string, number>>({});
const committedTimesheetCountsError = ref<string | null>(null);
let unsubscribePayrollTracking: (() => void) | undefined;
let isPayrollTrackingMounted = false;
let committedCountsRefreshQueue: Promise<void> = Promise.resolve();
const TRACKING_DATE_TOLERANCE_MSEC = 1;

const itemsQuery = ref(
  query(collection(db, "PayrollTracking"), orderBy("payPeriodEnding", "desc"))
);

const countMapEntries = function (value: unknown): number {
  if (typeof value !== "object" || value === null) {
    return 0;
  }
  return Object.keys(value as Record<string, unknown>).length;
};

const getCommittedExpenseCount = function (item: DocumentData): number {
  return countMapEntries(item.expenses);
};

const getCommittedTimesheetCount = function (item: DocumentData): number {
  return committedTimesheetCounts.value[item.id] ?? 0;
};

const getWeek1Ending = function (payPeriodEnding: Date): Date {
  const week1Zoned = subDays(toZonedTime(payPeriodEnding, APP_NATIVE_TZ), 7);
  return fromZonedTime(week1Zoned, APP_NATIVE_TZ);
};

const fetchLockedTimesheetCountForWeek = async function (weekEnding: Date): Promise<number> {
  const timeTrackingQuery = query(
    collection(db, "TimeTracking"),
    where("weekEnding", ">", Timestamp.fromDate(subMilliseconds(weekEnding, TRACKING_DATE_TOLERANCE_MSEC))),
    where("weekEnding", "<", Timestamp.fromDate(addMilliseconds(weekEnding, TRACKING_DATE_TOLERANCE_MSEC)))
  );
  try {
    const snapshot = await getDocs(timeTrackingQuery);
    return snapshot.docs.reduce((total, docSnap) => {
      return total + countMapEntries(docSnap.data().timeSheets);
    }, 0);
  } catch (error) {
    console.error("Unable to load committed timesheet count", weekEnding, error);
    throw error;
  }
};

const fetchCommittedTimesheetCount = async function (payPeriodEnding: Date): Promise<number> {
  const week1Ending = getWeek1Ending(payPeriodEnding);
  const [week1Count, week2Count] = await Promise.all([
    fetchLockedTimesheetCountForWeek(week1Ending),
    fetchLockedTimesheetCountForWeek(payPeriodEnding),
  ]);
  return week1Count + week2Count;
};

const buildCommittedCountsUpdate = async function (
  snapshot: QuerySnapshot<DocumentData>,
  previousCounts: Record<string, number>
): Promise<{ counts: Record<string, number>; hasErrors: boolean }> {
  const nextCounts = { ...previousCounts };

  snapshot.docChanges().forEach((change) => {
    if (change.type === "removed") {
      delete nextCounts[change.doc.id];
    }
  });

  const changedCounts = await Promise.allSettled(
    snapshot.docChanges()
      .filter((change) => change.type !== "removed")
      .map(async (change) => {
        const payPeriodEnding = (
          change.doc as QueryDocumentSnapshot<DocumentData>
        ).data().payPeriodEnding?.toDate();
        if (!(payPeriodEnding instanceof Date)) {
          return [change.doc.id, 0] as const;
        }
        const count = await fetchCommittedTimesheetCount(payPeriodEnding);
        return [change.doc.id, count] as const;
      })
  );

  let hasErrors = false;
  changedCounts.forEach((result) => {
    if (result.status === "fulfilled") {
      const [id, count] = result.value;
      nextCounts[id] = count;
      return;
    }
    hasErrors = true;
  });

  return { counts: nextCounts, hasErrors };
};

const refreshCommittedCounts = async function (
  snapshot: QuerySnapshot<DocumentData>
): Promise<void> {
  const { counts, hasErrors } = await buildCommittedCountsUpdate(
    snapshot,
    committedTimesheetCounts.value
  );
  if (!isPayrollTrackingMounted) {
    return;
  }
  committedTimesheetCounts.value = counts;
  committedTimesheetCountsError.value = hasErrors
    ? "Committed time sheet counts may be out of date."
    : null;
};

onMounted(() => {
  isPayrollTrackingMounted = true;
  unsubscribePayrollTracking = onSnapshot(itemsQuery.value, (snapshot) => {
    committedCountsRefreshQueue = committedCountsRefreshQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          await refreshCommittedCounts(snapshot);
        } catch (error) {
          if (!isPayrollTrackingMounted) {
            return;
          }
          committedTimesheetCountsError.value =
            "Committed time sheet counts may be out of date.";
          console.error("Unable to refresh payroll tracking counts", error);
        }
      });
  });
});

onUnmounted(() => {
  isPayrollTrackingMounted = false;
  committedCountsRefreshQueue = Promise.resolve();
  unsubscribePayrollTracking?.();
});

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
  let weekEndingZoned = toZonedTime(timestamp.toDate(), APP_NATIVE_TZ);
  if (week1) {
    // must calculate the week1 ending and run the query
    weekEndingZoned = subDays(
      toZonedTime(timestamp.toDate(), APP_NATIVE_TZ),
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
