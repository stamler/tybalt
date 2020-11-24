<template>
  <div id="list">
    <div class="listentry" v-for="item in processedItems" v-bind:key="item.id">
      <div class="anchorbox">
        <router-link :to="[parentPath, item.id, 'details'].join('/')">
          {{ item.weekEnding.toDate() | exportDate }}
        </router-link>
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline"></div>
          <div class="byline"></div>
        </div>
        <div class="firstline" v-if="hasPending(item)">
          {{ item.pending.length }} time sheet(s) pending
        </div>
        <div class="secondline" v-if="hasLocked(item)">
          {{ item.timeSheets.length }} locked time sheet(s)
        </div>
        <div class="thirdline"></div>
      </div>
      <div class="rowactionsbox">
        <router-link
          v-if="hasPending(item)"
          v-bind:to="{ name: 'Time Tracking' }"
          v-on:click.native="lockTimesheets(item.weekEnding)"
        >
          <lock-icon></lock-icon>
        </router-link>
        <a v-if="hasLink(item, 'json')" download v-bind:href="item['json']">
          .json<download-icon></download-icon>
        </a>
        <router-link
          v-if="hasLink(item, 'json')"
          v-bind:to="{ name: 'Time Tracking' }"
          v-on:click.native="generatePayrollCSV(item['json'])"
        >
          payroll<download-icon></download-icon>
        </router-link>
        <router-link
          v-if="hasLink(item, 'json')"
          v-bind:to="{ name: 'Time Tracking' }"
          v-on:click.native="generateInvoicingCSV(item['json'])"
        >
          invoicing<download-icon></download-icon>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script>
import { format } from "date-fns";
import { LockIcon, DownloadIcon } from "vue-feather-icons";
import firebase from "@/firebase";
import store from "../store";
import { parse } from "json2csv";
const db = firebase.firestore();

export default {
  props: ["collection"], // a string, the Firestore Collection name
  components: {
    LockIcon,
    DownloadIcon
  },
  computed: {
    processedItems() {
      // Show only items with pending or locked TimeSheets
      return this.items.filter(x => this.hasPending(x) || this.hasLocked(x));
    }
  },
  filters: {
    exportDate(date) {
      return format(date, "EEE MMM dd");
    }
  },
  data() {
    return {
      parentPath: "",
      collectionObject: null,
      items: []
    };
  },
  created() {
    this.parentPath = this.$route.matched[
      this.$route.matched.length - 1
    ].parent.path;
    this.collectionObject = db.collection(this.collection);
    this.$bind("items", this.collectionObject).catch(error => {
      alert(`Can't load TimeTracking: ${error.message}`);
    });
  },
  methods: {
    hasLink(item, property) {
      return (
        Object.prototype.hasOwnProperty.call(item, property) &&
        item[property].length > 32
      );
    },
    hasPending(item) {
      return (
        Object.prototype.hasOwnProperty.call(item, "pending") &&
        item.pending.length > 0
      );
    },
    hasLocked(item) {
      return (
        Object.prototype.hasOwnProperty.call(item, "timeSheets") &&
        item.timeSheets.length > 0
      );
    },
    lockTimesheets(weekEnding) {
      const lockTimesheets = firebase
        .functions()
        .httpsCallable("lockTimesheets");
      const week = weekEnding.toDate().getTime();
      // TODO: replace confirm() with modal in Vue
      if (
        confirm("Locking Timesheets is not reversible. Do you want to proceed?")
      ) {
        store.commit("startTask", {
          id: `lock${week}`,
          message: "locking + exporting"
        });
        return lockTimesheets({ weekEnding: week })
          .then(() => {
            store.commit("endTask", { id: `lock${week}` });
          })
          .catch(error => {
            store.commit("endTask", { id: `lock${week}` });
            alert(`Error exporting timesheets: ${error.message}`);
          });
      }
    },
    async generatePayrollCSV(url) {
      const response = await fetch(url);
      const items = await response.json();

      for (const item of items) {
        delete item.uid;
        delete item.managerUid;
        delete item.jobsTally;
        delete item.divisionsTally;
        delete item.entries;
        item["R"] = item.workHoursTally.jobHours + item.workHoursTally.hours;
        delete item.workHoursTally;
        for (const key in item.nonWorkHoursTally) {
          item[key] = item.nonWorkHoursTally[key];
        }
        delete item.nonWorkHoursTally;
        item["RB"] = item.bankedHours;
        delete item.bankedHours;
      }
      const csv = parse(items);
      const blob = new Blob([csv], { type: "text/csv" });
      this.downloadBlob(blob, "payroll.csv");
    },
    async generateInvoicingCSV(url) {
      const response = await fetch(url);
      const items = await response.json();
      const output = [];

      for (const item of items) {
        for (const entry of item.entries) {
          if (entry.timetype !== "R") continue;
          // TODO: verify that time zone conversion isn't needed here
          const date = new Date(entry.date);
          const line = {
            client: "TBTE",
            job: "", // the job number
            code: entry.division,
            date: date.getDate(),
            month: date.getMonth() + 1,
            year: date.getFullYear(),
            qty: entry.jobHours || 0,
            unit: "hours",
            nc: entry.hours || 0,
            meals: entry.mealsHours || 0,
            ref: entry.workrecord || "",
            project: "",
            notes: entry.notes, // consolidate comments and description
            employee: item.displayName
          };
          if (entry.job !== undefined) {
            // There is a job number, populate client, job, description
            line.client = item.jobsTally[entry.job].client;
            line.job = entry.job;
            line.project = item.jobsTally[entry.job].description;
          }
          output.push(line);
        }
      }
      const csv = parse(output);
      const blob = new Blob([csv], { type: "text/csv" });
      this.downloadBlob(blob, "invoicing.csv");
    },
    // Force the download of a blob to a file by creating an
    // anchor and programmatically clicking it.
    downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "download";

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
  }
};
</script>
