<template>
  <div id="list">
    <div class="listentry" v-for="item in items" v-bind:key="item.id">
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
          v-bind:to="{ name: 'Time Exports' }"
          v-on:click.native="lockTimesheets(item.weekEnding)"
        >
          <lock-icon></lock-icon>
        </router-link>
        <router-link
          v-bind:to="{ name: 'Time Exports' }"
          v-on:click.native="exportTimesheets(item.weekEnding)"
        >
          <file-plus-icon></file-plus-icon>
        </router-link>
        <a 
          v-bind:download="downloadFilename(item)" 
          v-bind:href="jsonDownload(item)"
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
    downloadFilename(item) {
      // generate the filename for the downloaded export
      return format(item.weekEnding.toDate(), "yyyy MMM dd") + ".json";
    },
    jsonDownload(item) {
      // return a json file where the key is the weekEnding and 
      // the value is the array of timeSheets
      return "data:text/json;charset=utf-8," + 
        encodeURIComponent(JSON.stringify({ [item.weekEnding]: item.timeSheets }));
    },
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
    }
  }
};
</script>
