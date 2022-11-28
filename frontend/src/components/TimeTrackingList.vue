<template>
  <div id="list">
    <div class="listentry" v-for="item in processedItems" v-bind:key="item.id">
      <div class="anchorbox">
        <router-link :to="[parentPath, item.id, 'details'].join('/')">
          {{ exportDate(item.weekEnding.toDate()) }}
        </router-link>
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline"></div>
          <div class="byline"></div>
        </div>
        <div class="firstline" v-if="hasApproved(item)">
          {{ Object.keys(item.pending).length }} approved time sheet(s)
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
        <a
          style="display: block"
          v-if="hasLink(item, 'json')"
          download
          :href="item['json']"
        >
          json<download-icon></download-icon>
        </a>
        <action-button
          v-if="hasLink(item, 'json')"
          type="download"
          @click="generateTimeReportCSV(item['json'])"
        >
          csv
        </action-button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { exportDate, generateTimeReportCSV } from "./helpers";
import ActionButton from "./ActionButton.vue";
import { DownloadIcon } from "vue-feather-icons";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  collection,
  CollectionReference,
  DocumentData,
  query,
  orderBy,
} from "firebase/firestore";
const db = getFirestore(firebaseApp);

export default defineComponent({
  props: ["collectionName"], // a string, the Firestore Collection name
  components: {
    ActionButton,
    DownloadIcon,
  },
  computed: {
    processedItems(): DocumentData[] {
      // Show only items with submitted, approved or locked TimeSheets
      return this.items.filter(
        (x: DocumentData) =>
          this.hasApproved(x) || this.hasLocked(x) || this.hasSubmitted(x)
      );
    },
  },
  data() {
    return {
      parentPath: "",
      collectionObject: null as CollectionReference | null,
      items: [],
    };
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
    this.collectionObject = collection(db, this.collectionName);
    this.$firestoreBind(
      "items",
      query(this.collectionObject, orderBy("weekEnding", "desc"))
    ).catch((error: unknown) => {
      if (error instanceof Error) {
        alert(`Can't load TimeTracking: ${error.message}`);
      } else alert(`Can't load TimeTracking: ${JSON.stringify(error)}`);
    });
  },
  methods: {
    exportDate,
    generateTimeReportCSV,
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
    hasApproved(item: DocumentData) {
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
  },
});
</script>
