<template>
  <DSList
    v-if="itemsQuery !== null"
    :query="itemsQuery"
    :processor-fn="processingFunction"
  >
    <template #anchor="item">
      <router-link :to="[parentPath, item.id, 'details'].join('/')">
        {{ exportDate(item.weekEnding.toDate()) }}
      </router-link>
    </template>
    <template #line1="item">
      <span v-if="hasApproved(item)">
        {{ Object.keys(item.pending).length }} approved time sheet(s)
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
        type="user"
        @click="timeSummary(item.weekEnding.toDate())"
        title="time summary"
      />
      <a
        style="display: block"
        v-if="hasLink(item, 'json')"
        download
        :href="item['json']"
      >
        json<Icon icon="feather:download" width="24px" />
      </a>
      <action-button
        v-if="hasLink(item, 'json')"
        type="download"
        @click="generateTimeReportCSV(item['json'])"
      >
        csv
      </action-button>
    </template>
  </DSList>
</template>

<script setup lang="ts">
import DSList from "./DSList.vue";
import { ref } from "vue";
import { useRoute } from "vue-router";
import {
  exportDate,
  generateTimeReportCSV,
  hasLink,
  exportDateWeekStart,
  downloadBlob,
} from "./helpers";
import ActionButton from "./ActionButton.vue";
import { Icon } from "@iconify/vue";
import { firebaseApp } from "../firebase";
import {
  getFunctions,
  httpsCallable,
  HttpsCallableResult,
} from "firebase/functions";
import { Parser } from "@json2csv/plainjs";
import { useStateStore } from "@/stores/state";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { APP_NATIVE_TZ } from "../config";
import {
  getFirestore,
  collection,
  DocumentData,
  query,
  orderBy,
} from "firebase/firestore";

const parser = new Parser();
const store = useStateStore();
const functions = getFunctions(firebaseApp);
const route = useRoute();
const parentPath = ref(route?.matched[route.matched.length - 2]?.path ?? "");

const hasSubmitted = function (item: DocumentData) {
  return (
    Object.prototype.hasOwnProperty.call(item, "submitted") &&
    Object.keys(item.submitted).length > 0
  );
};
const hasApproved = function (item: DocumentData) {
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
const processingFunction = (items: DocumentData[]) => {
  // Show only items with submitted, approved or locked TimeSheets
  return items.filter(
    (x: DocumentData) => hasApproved(x) || hasLocked(x) || hasSubmitted(x)
  );
};

const itemsQuery = ref(
  query(
    collection(getFirestore(firebaseApp), "TimeTracking"),
    orderBy("weekEnding", "desc")
  )
);

const timeSummary = async function (weekEnding: Date) {
  const start = new Date();
  store.startTask({
    id: `getTimeSummary${start.getTime()}`,
    message: "Getting Time Summary",
  });
  const weekEndingZoned = toZonedTime(weekEnding, APP_NATIVE_TZ);
  const queryValues = [format(weekEndingZoned, "yyyy-MM-dd")];
  const queryMySQL = httpsCallable(functions, "queryMySQL");
  let response: HttpsCallableResult;
  try {
    response = await queryMySQL({
      queryName: "weeklyTimeSummaryPerEmployee",
      queryValues,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csv = parser.parse(response.data as Array<any>);
    const blob = new Blob([csv], { type: "text/csv" });
    const filename = `time_summary_${exportDateWeekStart(
      weekEnding
    )}-${exportDate(weekEnding)}.csv`;
    store.endTask(`getTimeSummary${start.getTime()}`);
    downloadBlob(blob, filename);
  } catch (error) {
    store.endTask(`getTimeSummary${start.getTime()}`);
    alert(`Error: ${error}`);
  }
}
</script>
