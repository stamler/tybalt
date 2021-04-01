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
  distance: number;
}
type Expense = ExpenseRegular | ExpenseMileage;

// Type Guards
function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x != null;
}

function isExpenseCommon(data: unknown): data is ExpenseCommon {
  if (!isObject(data)) {
    return false;
  }
  // check optional string properties have correct type
  const optionalStringVals = ["client", "job", "jobDescription"]
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
    "division",
    "divisionName",
  ]
    .map((x) => data[x] !== undefined && typeof data[x] === "string")
    .every((x) => x === true);
  return optionalStringVals && stringVals;
}

function isExpenseRegular(data: unknown): data is ExpenseRegular {
  if (!isObject(data)) {
    return false;
  }
  const paymentType =
    data.paymentType === "Expense" ||
    data.paymentType === "CorporateCreditCard";
  const total = typeof data.total === "number" && data.total > 0;
  const optionalStringVals = ["vendorName", "attachment", "po"]
    .map((x) => data[x] === undefined || typeof data[x] === "string")
    .every((x) => x === true);
  return isExpenseCommon(data) && paymentType && total && optionalStringVals;
}

function isExpenseMileage(data: unknown): data is ExpenseMileage {
  if (!isObject(data)) {
    return false;
  }
  const paymentType = data.paymentType === "Mileage";
  const distance =
    typeof data.distance === "number" &&
    data.distance > 0 &&
    Number.isInteger(data.distance);
  return isExpenseCommon(data) && paymentType && distance;
}

function isExpense(data: unknown): data is Expense {
  return isExpenseRegular(data) || isExpenseMileage(data);
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
          label: "calculatedSubtotal",
          value: (row: Expense) =>
            row.paymentType !== "Mileage" ? row.total * (100 / 113) : "",
        },
        {
          label: "calculatedOntarioHST",
          value: (row: Expense) =>
            row.paymentType !== "Mileage" ? row.total * (13 / 113) : "",
        },
        {
          label: "Total",
          value: (row: Expense) =>
            row.paymentType !== "Mileage"
              ? row.total
              : row.distance * MILEAGE_RATE,
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
