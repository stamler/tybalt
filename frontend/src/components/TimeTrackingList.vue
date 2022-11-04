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
import Vue from "vue";
import { exportDate, generateTimeReportCSV } from "./helpers";
import ActionButton from "./ActionButton.vue";
import { DownloadIcon } from "vue-feather-icons";
import firebase from "../firebase";
const db = firebase.firestore();

export default Vue.extend({
  props: ["collection"], // a string, the Firestore Collection name
  components: {
    ActionButton,
    DownloadIcon,
  },
  computed: {
    processedItems(): firebase.firestore.DocumentData[] {
      // Show only items with submitted, approved or locked TimeSheets
      return this.items.filter(
        (x: firebase.firestore.DocumentData) =>
          this.hasApproved(x) || this.hasLocked(x) || this.hasSubmitted(x)
      );
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
      this.collectionObject.orderBy("weekEnding", "desc")
    ).catch((error: unknown) => {
      if (error instanceof Error) {
        alert(`Can't load TimeTracking: ${error.message}`);
      } else alert(`Can't load TimeTracking: ${JSON.stringify(error)}`);
    });
  },
  methods: {
    exportDate,
    generateTimeReportCSV,
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
    hasApproved(item: firebase.firestore.DocumentData) {
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
  },
});
</script>
