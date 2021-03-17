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
        <a v-if="hasLink(item, 'zip')" download v-bind:href="item['zip']">
          attachments.zip<download-icon></download-icon>
        </a>
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
import { DownloadIcon, RefreshCwIcon } from "vue-feather-icons";
import { parse } from "json2csv";

const db = firebase.firestore();

interface ExpenseCommon {
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
  division: string;
  divisionName: string;
  client?: string;
  job?: string;
  jobDescription?: string;
}
interface ExpenseRegular extends ExpenseCommon {
  paymentType: "Expense" | "CorporateCreditCard";
  total: number;
  vendorName?: string;
  attachment?: string;
  po?: string;
}
interface ExpenseMileage extends ExpenseCommon {
  paymentType: "Mileage";
  odoStart: number;
  odoEnd: number;
}
type Expense = ExpenseRegular | ExpenseMileage;

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
  // check optional number properties have correct type
  const optionalNumVals = ["total", "odoStart", "odoEnd"]
    .map((x) => data[x] === undefined || typeof data[x] === "number")
    .every((x) => x === true);
  return optionalStringVals && stringVals && optionalNumVals;
}

export default mixins.extend({
  props: ["collection"],
  components: { DownloadIcon, RefreshCwIcon },
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
      const MILEAGE_RATE = 0.5; // dollars per km
      const response = await fetch(url);
      const items = (await response.json()) as Expense[];

      // since all entries have the same week ending, pull from the first entry
      const weekEnding = new Date(items[0].committedWeekEnding);
      const fields = [
        {
          label: "Acct/Visa/Exp",
          value: "paymentType",
        },
        {
          label: "Job #",
          value: "job",
        },
        {
          label: "Div",
          value: "division",
        },
        {
          label: "Date",
          value: (row: Expense) => new Date(row.date).getDate(),
        },
        {
          label: "Month",
          value: (row: Expense) =>
            new Date(row.date).toLocaleString("en-US", { month: "short" }),
        },
        {
          label: "Year",
          value: (row: Expense) => new Date(row.date).getFullYear(),
        },
        {
          label: "Total",
          value: (row: Expense) =>
            row.paymentType !== "Mileage"
              ? row.total
              : (row.odoEnd - row.odoStart) * MILEAGE_RATE,
        },
        {
          label: "PO#",
          value: "po",
        },
        {
          label: "Description",
          value: "description",
        },
        {
          label: "Company",
          value: "vendorName",
        },
        {
          label: "Employee",
          value: "displayName",
        },
        {
          label: "Approved By",
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
        `payables_${this.exportDateWeekStart(weekEnding)}-${this.exportDate(
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
