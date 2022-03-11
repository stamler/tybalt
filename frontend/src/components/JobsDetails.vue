<template>
  <div>
    <h3>{{ this.id }}</h3>
    <div>client: {{ item.client }}</div>
    <div>client contact: {{ item.clientContact }}</div>
    <div>description: {{ item.description }}</div>
    <div>manager: {{ item.manager }}</div>
    <div>status: {{ item.status }}</div>
    <h4>Time Entries</h4>
    <form id="editor">
      <span class="field">
        <label for="startDate">from</label>
        <datepicker
          name="startDate"
          input-class="calendar-input"
          wrapper-class="calendar-wrapper"
          placeholder="Start Date"
          :inline="false"
          :disabledDates="dps.disabled"
          :highlighted="dps.highlighted"
          v-model="startDate"
        />
      </span>
      <span class="field">
        <label for="endDate">to</label>
        <datepicker
          name="endDate"
          input-class="calendar-input"
          wrapper-class="calendar-wrapper"
          placeholder="End Date"
          :inline="false"
          :disabledDates="dps.disabled"
          :highlighted="dps.highlighted"
          v-model="endDate"
        />
      </span>
      <span class="field" v-if="isTopLevelJob(id)">
        <label for="subJobs">sub jobs?</label>
        <input name="subJobs" type="checkbox" v-model="subJobs" />
      </span>
    </form>

    <h5>Summary</h5>
    <query-box
      :queryName="
        subJobs ? 'jobEntriesSummary-startsWith' : 'jobEntriesSummary'
      "
      :queryValues="[
        id,
        startDate.toISOString().substring(0, 10),
        endDate.toISOString().substring(0, 10),
      ]"
      :dlFileName="`${id}_JobEntriesSummary.csv`"
    />

    <!-- Link to related TimeSheets for context. Available to report
    claimholders only -->
    <div v-if="claims.report === true">
      <h5>
        Full Report
        <download-query-link
          style="display: inline-block"
          :queryName="fullReportSubJobs ? 'jobReport-startsWith' : 'jobReport'"
          :queryValues="[id]"
          :dlFileName="`${id}_JobReport.csv`"
        />
      </h5>
      <span class="field" v-if="isTopLevelJob(id)">
        <label for="fullReportSubJobs">include sub jobs? </label>
        <input
          name="fullReportSubJobs"
          type="checkbox"
          v-model="fullReportSubJobs"
        />
      </span>

      <h4>Time Sheets</h4>
      <div v-for="timeSheet in timeSheets" v-bind:key="timeSheet.id">
        {{ timeSheet.weekEnding.toDate() | relativeTime }} -
        <router-link
          v-bind:to="{
            name: 'Time Sheet Details',
            params: { id: timeSheet.id },
          }"
          >{{ timeSheet.displayName }}</router-link
        >
        /non-chargeable: {{ timeSheet.jobsTally[id].hours }} /chargeable:
        {{ timeSheet.jobsTally[id].jobHours }}
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import mixins from "./mixins";
import firebase from "../firebase";
const db = firebase.firestore();
import { format, formatDistanceToNow } from "date-fns";
import { DownloadIcon, RefreshCwIcon } from "vue-feather-icons";
import { mapState } from "vuex";
import Datepicker from "vuejs-datepicker";
import QueryBox from "./QueryBox.vue";
import DownloadQueryLink from "./DownloadQueryLink.vue";

export default mixins.extend({
  computed: mapState(["claims"]),
  props: ["id", "collection"],
  components: {
    Datepicker,
    DownloadIcon,
    RefreshCwIcon,
    QueryBox,
    DownloadQueryLink,
  },
  data() {
    return {
      dps: {
        // date picker state
        disabled: {
          to: new Date(2021, 4, 1),
        },
        highlighted: {
          dates: [new Date()],
        },
      },
      startDate: new Date(2021, 4, 1),
      endDate: new Date(),
      subJobs: false,
      fullReportSubJobs: false,
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      item: {} as firebase.firestore.DocumentData,
      timeSheets: [],
    };
  },
  filters: {
    dateFormat(date: Date): string {
      return format(date, "yyyy MMM dd / HH:mm:ss");
    },
    relativeTime(date: Date): string {
      return formatDistanceToNow(date, { addSuffix: true });
    },
  },
  watch: {
    id: function (id) {
      this.setItem(id);
    }, // first arg is newVal, second is oldVal
    startDate: function (startDate) {
      if (startDate > this.endDate) this.endDate = new Date(startDate);
    },
    endDate: function (endDate) {
      if (endDate < this.startDate) this.startDate = new Date(endDate);
    },
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.setItem(this.id);
  },
  methods: {
    isTopLevelJob(job: string) {
      // return true if the provided job doesn't have dashed subjobs
      const re = /^(P)?[0-9]{2}-[0-9]{3,4}$/;
      return re.test(job);
    },
    setItem(id: string) {
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }
      if (id) {
        this.collectionObject
          .doc(id)
          .get()
          .then((snap: firebase.firestore.DocumentSnapshot) => {
            const result = snap.data();
            if (result === undefined) {
              // A document with this id doesn't exist in the database,
              // list instead.
              this.$router.push(this.parentPath);
            } else {
              this.item = result;
              this.$bind(
                "timeSheets",
                db
                  .collection("TimeSheets")
                  .where("locked", "==", true)
                  .where("jobNumbers", "array-contains", this.id)
                  .orderBy("weekEnding", "desc")
              ).catch((error) => {
                alert(`Can't load time sheets: ${error.message}`);
              });
            }
          });
      } else {
        this.item = {};
      }
    },
  },
});
</script>
<style scoped>
h4,
h5 {
  margin-top: 2em;
}
</style>
