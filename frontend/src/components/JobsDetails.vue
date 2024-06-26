<template>
  <div>
    <h3>{{ id }}</h3>
    <div>client: {{ item.client }}</div>
    <div>client contact: {{ item.clientContact }}</div>
    <div>description: {{ item.description }}</div>
    <div>manager: {{ item.managerDisplayName }}</div>
    <div v-if="item.alternateManagerUid">
      alt. manager: {{ item.alternateManagerDisplayName }}
    </div>
    <div>status: {{ item.status }}</div>
    <div v-if="item.categories" style="display: flex; flex-wrap: wrap">
      categories:
      <span class="label" v-for="category in item.categories" :key="category">
        {{ category }}
      </span>
    </div>
    <h4>
      Invoices
      <router-link v-bind:to="{ name: 'Create Invoice' }">
        <Icon icon="feather:plus-circle" width="24px" />
      </router-link>
    </h4>
    <div v-for="invoice in invoices" v-bind:key="invoice.id">
      <router-link
        v-bind:to="{
          name: 'Invoice Details',
          params: { invoiceId: invoice.id },
        }"
      >
        {{ invoiceNumberDisplay(invoice) }} /
        {{ relativeTime(invoice.createdDate.toDate()) }} — ${{
          invoiceTotal(invoice)
        }}
      </router-link>
    </div>
    <h4>Time Entries</h4>
    <form id="editor">
      <label for="startDate">from</label>
      <datepicker
        name="startDate"
        placeholder="Start Date"
        :clearable="false"
        :auto-apply="true"
        :min-date="dps.disabled.to"
        :highlight="dps.highlight"
        :enable-time-picker="false"
        :format="shortDateWithWeekday"
        week-start="0"
        hide-input-icon
        input-class-name="field"
        v-model="startDate"
      />
      <label for="endDate">to</label>
      <datepicker
        name="endDate"
        placeholder="End Date"
        :clearable="false"
        :auto-apply="true"
        :min-date="dps.disabled.to"
        :highlight="dps.highlight"
        :enable-time-picker="false"
        :format="shortDateWithWeekday"
        week-start="0"
        hide-input-icon
        input-class-name="field"
        v-model="endDate"
      />
      <span class="field" v-if="isTopLevelJob(id)">
        <label for="subJobs">sub jobs?</label>
        <input name="subJobs" type="checkbox" v-model="subJobs" />
      </span>
    </form>
    <h5>Division Summary</h5>
    <query-box
      :queryName="
        subJobs
          ? 'jobEntriesSummaryByDivisionWithValues-startsWith'
          : 'jobEntriesSummaryByDivisionWithValues'
      "
      :queryValues="[
        id,
        startDate.toISOString().substring(0, 10),
        endDate.toISOString().substring(0, 10),
      ]"
      :dlFileName="`${id}_JobEntriesSummaryByDivision.csv`"
    />

    <h5>Staff Summary</h5>
    <query-box
      :queryName="
        subJobs
          ? 'jobEntriesSummaryWithValues-startsWith'
          : 'jobEntriesSummaryWithValues'
      "
      :queryValues="[
        id,
        startDate.toISOString().substring(0, 10),
        endDate.toISOString().substring(0, 10),
      ]"
      :dlFileName="`${id}_JobEntriesSummaryByStaff.csv`"
    />

    <!-- Link to related TimeSheets for context. Available to report or tapr
    claimholders only -->
    <div v-if="claims.report === true || claims.tapr === true">
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
    </div>
    <div v-if="claims.report === true">
      <h4>Time Sheets</h4>
      <div v-for="timeSheet in timeSheets" v-bind:key="timeSheet.id">
        {{ relativeTime(timeSheet.weekEnding.toDate()) }} -
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
import { defineComponent } from "vue";
import { useCollection } from "vuefire";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  CollectionReference,
  DocumentData,
  DocumentSnapshot,
  query,
  where,
  orderBy,
} from "firebase/firestore";
const db = getFirestore(firebaseApp);
import { formatDistanceToNow } from "date-fns";
import { useStateStore } from "../stores/state";
import Datepicker from "@vuepic/vue-datepicker";
import QueryBox from "./QueryBox.vue";
import DownloadQueryLink from "./DownloadQueryLink.vue";
import { shortDateWithWeekday, invoiceNumberDisplay } from "./helpers";
import { Icon } from "@iconify/vue";
import { InvoiceLineObject } from "./types";

export default defineComponent({
  setup() {
    const store = useStateStore();
    return { claims: store.claims };
  },
  props: ["id", "collectionName"],
  components: {
    Datepicker,
    QueryBox,
    DownloadQueryLink,
    Icon,
  },
  data() {
    return {
      dps: {
        // date picker state
        disabled: {
          to: new Date(2021, 5, 12), // stopped allowing hours (not jobHours) to be billed with job numbers on June 12, 2021
        },
        highlight: {
          dates: [new Date()],
        },
      },
      startDate: new Date(2021, 5, 12),
      endDate: new Date(),
      subJobs: false,
      fullReportSubJobs: false,
      parentPath: "",
      collectionObject: null as CollectionReference | null,
      item: {} as DocumentData,
      timeSheets: [] as DocumentData[],
      invoices: useCollection(
        query(
          collection(db, "Invoices"),
          where("job", "==", this.id),
          where("replaced", "==", false),
          orderBy("date", "desc")
        )
      ),
    };
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
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
    this.collectionObject = collection(db, this.collectionName);
    this.setItem(this.id);
  },
  methods: {
    invoiceTotal(invoice: DocumentData) {
      return invoice.lineItems.reduce(
        (total: number, lineItem: InvoiceLineObject) => total + lineItem.amount,
        0
      );
    },
    shortDateWithWeekday,
    invoiceNumberDisplay,
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
        getDoc(doc(this.collectionObject, id)).then(
          (snap: DocumentSnapshot) => {
            const result = snap.data();
            if (result === undefined) {
              // A document with this id doesn't exist in the database,
              // list instead.
              this.$router.push(this.parentPath);
            } else {
              this.item = result;
              // If the user has the report claim, load the time sheets.
              // Otherwise don't because they're not allowed to see them.
              if (this.claims.report !== true) return;
              this.$firestoreBind(
                "timeSheets",
                query(
                  collection(db, "TimeSheets"),
                  where("locked", "==", true),
                  where("jobNumbers", "array-contains", this.id),
                  orderBy("weekEnding", "desc")
                )
              ).catch((error: unknown) => {
                if (error instanceof Error) {
                  alert(`Can't load time sheets: ${error.message}`);
                } else
                  alert(`Can't load time sheets: ${JSON.stringify(error)}`);
              });
            }
          }
        );
      } else {
        this.item = {};
      }
    },
    relativeTime(date: Date): string {
      return formatDistanceToNow(date, { addSuffix: true });
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
