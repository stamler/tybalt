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
        <div class="firstline" v-if="item.pending !== undefined && item.pending.length > 0">{{ item.pending.length }} time sheet(s) pending</div>
        <div class="secondline" v-if="item.timeSheets !== undefined && item.timeSheets.length > 0">{{ item.timeSheets.length }} locked time sheet(s)</div>
        <div class="thirdline"></div>
      </div>
      <div class="rowactionsbox">
        <router-link
          v-bind:to="{ name: 'Time Tracking' }"
          v-on:click.native="lockTimesheets(item.weekEnding)"
        >
          <lock-icon></lock-icon>
        </router-link>
        <router-link
          v-bind:to="{ name: 'Time Tracking' }"
          v-on:click.native="exportTimesheets(item.id)"
        >
          <file-plus-icon></file-plus-icon>
        </router-link>
        <a 
          download
          v-bind:href="item['json']"
        >
          .json<download-icon></download-icon>
        </a>
        <a 
          download="filename.csv" 
          href="filePath"
        >
          .csv<download-icon></download-icon>
        </a>
      </div>
    </div>
  </div>
</template>

<script>
import { format } from "date-fns";
import { LockIcon, FilePlusIcon, DownloadIcon} from "vue-feather-icons";
import firebase from "@/firebase";
import store from "../store";
const db = firebase.firestore();

export default {
  components: {
    LockIcon,
    FilePlusIcon,
    DownloadIcon
  },
  computed: {
    processedItems() {
      //TODO: filter out items with no pending or timeSheets properties
      // or where the arrays exist but have length zero
      return this.items.filter(x => {
          return x.hasOwnProperty("pending") && x.pending.length > 0 || 
            x.hasOwnProperty("timeSheets") && x.timeSheets.length > 0 
      });
    }
  },
  filters: {
    exportDate(date) {
      return format(date, "EEE MMM dd");
    }
  },
  data() {
    return {
      parentPath: null,
      collection: null, // collection: a reference to the parent collection
      items: []
    };
  },
  created() {
    this.parentPath = this.$route.matched[
      this.$route.matched.length - 1
    ].parent.path;
    this.collection = this.$parent.collection;
    this.$bind("items", this.collection).catch(error => {
      alert(`Can't load TimeTracking: ${error.message}`);
    });
  },
  methods: {
    lockTimesheets(weekEnding) {
      const lockTimesheets = firebase
        .functions()
        .httpsCallable("lockTimesheets");
      // TODO: replace confirm() with modal in Vue
      if (confirm("Locking Timesheets is not reversible. Do you want to proceed?")) {
        return lockTimesheets({ weekEnding: weekEnding.toDate().getTime() }).catch(error => {
          alert(`Error exporting timesheets: ${error.message}`);
        });
      }
    },
    exportTimesheets(timeTrackingId) {
      const exportJson = firebase
        .functions()
        .httpsCallable("exportJson");
      return exportJson({ timeTrackingId }).catch(error => {
        alert(`Export JSON error: ${error.message}`);
      })
    }
  }
};
</script>
