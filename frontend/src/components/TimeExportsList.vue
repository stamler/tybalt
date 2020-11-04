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
        <div class="firstline" v-if="item.pending !== undefined">{{ item.pending.length }} time sheets pending export</div>
        <div class="secondline" v-if="item.timeSheets !== undefined">{{ item.timeSheets.length }} time sheets exported</div>
        <div class="thirdline"></div>
      </div>
      <div class="rowactionsbox">
        <router-link
          v-bind:to="{ name: 'Time Exports' }"
          v-on:click.native="exportTimesheets(item.weekEnding)"
        >
          <refresh-cw-icon></refresh-cw-icon>
        </router-link>
        <download-icon></download-icon>
      </div>
    </div>
  </div>
</template>

<script>
import { format } from "date-fns";
import { RefreshCwIcon, DownloadIcon} from "vue-feather-icons";
import firebase from "@/firebase";
import store from "../store";
const db = firebase.firestore();

export default {
  components: {
    RefreshCwIcon,
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
      alert(`Can't load TimeExports: ${error.message}`);
    });
  },
  methods: {
    exportTimesheets(weekEnding) {
      const exportTimesheets = firebase
        .functions()
        .httpsCallable("exportTimesheets");
      return exportTimesheets({ weekEnding: weekEnding.toDate().getTime() }).catch(error => {
        alert(`Error exporting timesheets: ${error.message}`);
      });
    }
  }
};
</script>
