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
        <div class="firstline">
          {{ Object.keys(item.expenses).length }} expense(s)
        </div>
        <div class="secondline"></div>
      </div>
      <div class="rowactionsbox">
        <a v-if="hasLink(item, 'json')" download v-bind:href="item['json']">
          .json<download-icon></download-icon>
        </a>
        <router-link
          v-if="hasLink(item, 'json')"
          v-bind:to="{ name: 'Expense Tracking' }"
          v-on:click.native="generatePayablesCSV(item['json'])"
        >
          payables<download-icon></download-icon>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { utcToZonedTime } from "date-fns-tz";
import firebase from "../firebase";
import mixins from "./mixins";
import { format } from "date-fns";
import { DownloadIcon } from "vue-feather-icons";
import { parse } from "json2csv";

const db = firebase.firestore();

interface Expense {
  uid: string;
  displayName: string;
  surname: string;
  givenName: string;
  committedWeekEnding: string;
  commitTime: string;
  commitName: string;
  commitUid: string;
  managerName: string;
  managerUid: string;
  description: string;
  date: string;
  total: number;
  attachment?: string;
  client?: string;
  job?: string;
  jobDescription?: string;
  po?: string;
}

// Type Guard
function isExpense(data: any): data is Expense {
  // check optional string properties have correct type
  const optionalStringVals = [
    "attachment",
    "client",
    "job",
    "jobDescription",
    "po",
  ]
    .map((x) => data[x] === undefined || typeof data[x] === "string")
    .every((x) => x === true);
  // check string properties exist and have correct type
  const stringVals = [
    "uid",
    "displayName",
    "surname",
    "givenName",
    "committedWeekEnding",
    "commitTime",
    "commitName",
    "commitUid",
    "managerName",
    "managerUid",
    "description",
    "date",
  ]
    .map((x) => data[x] !== undefined && typeof data[x] === "string")
    .every((x) => x === true);
  // check number properties exist and have correct type
  const numVals = ["total"]
    .map((x) => data[x] !== undefined && typeof data[x] === "number")
    .every((x) => x === true);
  return optionalStringVals && stringVals && numVals;
}

export default mixins.extend({
  props: ["collection"],
  components: { DownloadIcon },
  filters: {
    exportDate(date: Date) {
      return format(date, "yyyy MMM dd");
    },
  },
  data() {
    return {
      rejectionId: "",
      rejectionReason: "",
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      items: [],
    };
  },
  methods: {
    hasLink(item: firebase.firestore.DocumentData, property: string) {
      return (
        Object.prototype.hasOwnProperty.call(item, property) &&
        item[property].length > 32
      );
    },
    async generatePayablesCSV(url: string) {
      const response = await fetch(url);
      const items = (await response.json()) as Expense[];

      // since all entries have the same week ending, pull from the first entry
      const weekEnding = new Date(items[0].committedWeekEnding);
      const fields = [
        "committedWeekEnding",
        "surname",
        "givenName",
        "displayName",
        {
          label: "manager",
          value: "managerName",
        },
      ];
      const opts = { fields };
      const expenseRecords = items.map((x) => {
        if (!isExpense(x)) {
          throw new Error("There was an error validating the expense");
        }
        x["committedWeekEnding"] = format(
          utcToZonedTime(
            new Date(x.committedWeekEnding),
            "America/Thunder_Bay"
          ),
          "yyyy MMM dd"
        );
        return x;
      });
      const csv = parse(expenseRecords, opts);
      const blob = new Blob([csv], { type: "text/csv" });
      this.downloadBlob(
        blob,
        `payroll_${this.exportDateWeekStart(weekEnding)}-${this.exportDate(
          weekEnding
        )}.csv`
      );
    },
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.$bind(
      "items",
      this.collectionObject.orderBy("weekEnding", "desc")
    ).catch((error) => {
      alert(`Can't load ExpenseTracking: ${error.message}`);
    });
  },
});
</script>
