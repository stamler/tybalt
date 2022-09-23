<template>
  <div id="list">
    <h4 v-if="item.weekEnding">
      {{ weekStart | shortDate }} to
      {{ item.weekEnding.toDate() | shortDate }} ({{ this.expenses.length }},
      {{ countOfExpensesWithAttachments }} with attachments)
    </h4>
    <div v-for="(expenses, uid) in processedItems" v-bind:key="uid">
      <!-- There must be a first item so get displayName from it -->
      <span class="listheader"
        >{{ expenses[0].displayName }} ({{ expenses.length }})
      </span>
      <div class="listentry" v-for="exp in expenses" v-bind:key="exp.id">
        <div class="anchorbox">
          {{ exp.date.toDate() | shortDate }}
        </div>
        <div class="detailsbox">
          <div class="headline_wrapper">
            <div
              class="headline"
              v-if="!['Meals', 'Allowance'].includes(exp.paymentType)"
            >
              {{ exp.description }}
            </div>
            <div class="headline" v-else>
              {{ exp.breakfast ? "Breakfast" : "" }}
              {{ exp.lunch ? "Lunch" : "" }}
              {{ exp.dinner ? "Dinner" : "" }}
              {{ exp.lodging ? "Personal Accommodation" : "" }}
            </div>
            <div class="byline" v-if="exp.paymentType === 'Mileage'">
              {{ exp.distance }} km
            </div>
            <div
              class="byline"
              v-else-if="['Meals', 'Allowance'].includes(exp.paymentType)"
            ></div>
            <div class="byline" v-else>
              ${{ exp.total }}
              <span v-if="exp.po">/PO:{{ exp.po }}</span>
              <span v-if="exp.vendorName">/vendor: {{ exp.vendorName }}</span>
            </div>
          </div>
          <div class="secondline">
            <template v-if="exp.attachment">
              <router-link to="#" v-on:click.native="downloadAttachment(exp)">
                <download-icon></download-icon>
              </router-link>
            </template>
            <span
              v-else-if="['Meals', 'Allowance'].includes(exp.paymentType)"
            ></span>
            <span v-else>[no attachment]</span>
            <template v-if="exp.job !== undefined">
              {{ exp.job }} {{ exp.jobDescription }} for {{ exp.client }}
            </template>
            /approved by:{{ exp.managerName }}
          </div>
          <div class="thirdline">
            <span
              class="label"
              v-if="exp.paymentType === 'CorporateCreditCard'"
            >
              Corporate Credit Card *{{ exp.ccLast4digits }}
            </span>
            <span class="label" v-if="exp.paymentType === 'FuelCard'">
              Fuel Card *{{ exp.ccLast4digits }}
            </span>
            <span class="label" v-if="item.paymentType === 'FuelOnAccount'">
              Fuel on Account for unit {{ item.unitNumber }}
            </span>
          </div>
        </div>
        <div class="rowactionsbox">
          <router-link
            v-bind:to="{
              name: 'Expense Tracking Details',
              params: { id },
            }"
            v-on:click.native="uncommitExpense(exp.id)"
          >
            <unlock-icon></unlock-icon>
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import mixins from "./mixins";
import { format, subWeeks, addMilliseconds } from "date-fns";
import { mapState } from "vuex";
import firebase from "../firebase";
import store from "../store";
import _ from "lodash";
import { DownloadIcon, UnlockIcon } from "vue-feather-icons";

const db = firebase.firestore();

export default mixins.extend({
  props: ["id", "collection"],
  components: { DownloadIcon, UnlockIcon },
  computed: {
    ...mapState(["user", "claims"]),
    weekStart(): Date {
      if (this.item?.weekEnding !== undefined) {
        return addMilliseconds(subWeeks(this.item.weekEnding.toDate(), 1), 1);
      } else {
        return new Date();
      }
    },
    processedItems(): { [uid: string]: firebase.firestore.DocumentData[] } {
      return _.groupBy(this.expenses, "uid");
    },
    countOfExpensesWithAttachments(): number {
      return this.expenses.filter((x) =>
        Object.prototype.hasOwnProperty.call(x, "attachment")
      ).length;
    },
  },
  data() {
    return {
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      item: {} as firebase.firestore.DocumentData | undefined,
      expenses: [] as firebase.firestore.DocumentData[],
    };
  },
  filters: {
    shortDate(date: Date) {
      return format(date, "MMM dd, yyyy");
    },
  },
  watch: {
    id: function (id: string) {
      this.setItem(id);
    }, // first arg is newVal, second is oldVal
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.setItem(this.id);
  },
  methods: {
    setItem(id: string) {
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }
      if (id) {
        this.collectionObject
          .doc(id)
          .get()
          .then((snap) => {
            if (snap.exists) {
              this.item = snap.data();
              if (this.item === undefined) {
                throw "The ExpenseTracking document is empty";
              }
              if (this.item.weekEnding === undefined) {
                throw "The ExpenseTracking document is missing a week ending";
              }
              this.$bind(
                "expenses",
                db
                  .collection("Expenses")
                  .where("committedWeekEnding", "==", this.item.weekEnding)
                  .where("committed", "==", true)
              ).catch((error) => {
                alert(`Can't load Expenses: ${error.message}`);
              });
            } else {
              // A document with this id doesn't exist in the database,
              // list instead.  TODO: show a message to the user
              this.$router.push(this.parentPath);
            }
          });
      } else {
        this.item = {};
      }
    },
    uncommitExpense(id: string) {
      const uncommitExpense = firebase
        .functions()
        .httpsCallable("uncommitExpense");
      if (
        confirm(
          "You must check with accounting prior to uncommitting. Do you want to proceed?"
        )
      ) {
        store.commit("startTask", {
          id: `uncommit${id}`,
          message: "uncommitting",
        });
        return uncommitExpense({ id })
          .then(() => {
            store.commit("endTask", { id: `uncommit${id}` });
          })
          .catch((error) => {
            store.commit("endTask", { id: `uncommit${id}` });
            alert(`Error uncommitting timesheet: ${error.message}`);
          });
      }
    },
  },
});
</script>
<style scoped>
th,
td,
tr {
  text-align: center;
  background-color: lightgray;
}
.anchorbox {
  flex-basis: 6.5em;
}
</style>
