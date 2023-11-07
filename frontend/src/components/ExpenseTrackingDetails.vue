<template>
  <div id="list">
    <h4 v-if="item.weekEnding">
      {{ shortDate(weekStart) }} to
      {{ shortDate(item.weekEnding.toDate()) }} ({{ expenses.length }},
      {{ countOfExpensesWithAttachments }} with attachments)
    </h4>
    <div v-for="(expenses, uid) in processedItems" v-bind:key="uid">
      <!-- There must be a first item so get displayName from it -->
      <span class="listheader"
        >{{ expenses[0].displayName }} ({{ expenses.length }})
      </span>
      <div class="listentry" v-for="exp in expenses" v-bind:key="exp.id">
        <div class="anchorbox">
          {{ shortDate(exp.date.toDate()) }}
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
              <action-button type="download" @click="downloadAttachment(exp)" />
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
          <action-button type="unlock" @click="uncommitExpense(exp.id)" />
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { shortDate, downloadAttachment } from "./helpers";
import { subWeeks, addMilliseconds } from "date-fns";
import { useStateStore } from "../stores/state";
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
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import _ from "lodash";
import ActionButton from "./ActionButton.vue";

const db = getFirestore(firebaseApp);

export default defineComponent({
  setup() {
    const store = useStateStore();
    const { startTask, endTask } = store;
    return { startTask, endTask, user: store.user, claims: store.claims };
  },
  props: ["id", "collectionName"],
  components: { ActionButton },
  computed: {
    weekStart(): Date {
      if (this.item?.weekEnding !== undefined) {
        return addMilliseconds(subWeeks(this.item.weekEnding.toDate(), 1), 1);
      } else {
        return new Date();
      }
    },
    processedItems(): { [uid: string]: DocumentData[] } {
      return _.groupBy(this.expenses, "uid");
    },
    countOfExpensesWithAttachments(): number {
      return this.expenses.filter((x: DocumentData) =>
        Object.prototype.hasOwnProperty.call(x, "attachment")
      ).length;
    },
  },
  data() {
    return {
      parentPath: "",
      collectionObject: null as CollectionReference | null,
      item: {} as DocumentData,
      expenses: [] as DocumentData[],
    };
  },
  watch: {
    id: function (id: string) {
      this.setItem(id);
    }, // first arg is newVal, second is oldVal
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
    this.collectionObject = collection(db, this.collectionName);
    this.setItem(this.id);
  },
  methods: {
    shortDate,
    downloadAttachment,
    setItem(id: string) {
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }
      if (id) {
        getDoc(doc(this.collectionObject, id)).then(
          (snap: DocumentSnapshot) => {
            if (snap.exists()) {
              this.item = snap.data();
              if (this.item === undefined) {
                throw "The ExpenseTracking document is empty";
              }
              if (this.item.weekEnding === undefined) {
                throw "The ExpenseTracking document is missing a week ending";
              }
              this.$firestoreBind(
                "expenses",
                query(
                  collection(db, "Expenses"),
                  where("committedWeekEnding", "==", this.item.weekEnding),
                  where("committed", "==", true)
                )
              ).catch((error: unknown) => {
                if (error instanceof Error) {
                  alert(`Can't load Expenses: ${error.message}`);
                } else alert(`Can't load Expenses: ${JSON.stringify(error)}`);
              });
            } else {
              // A document with this id doesn't exist in the database,
              // list instead.  TODO: show a message to the user
              this.$router.push(this.parentPath);
            }
          }
        );
      } else {
        this.item = {};
      }
    },
    async uncommitExpense(id: string) {
      const functions = getFunctions(firebaseApp);
      const uncommitExpense = httpsCallable(functions, "uncommitExpense");
      if (
        confirm(
          "You must check with accounting prior to uncommitting. Do you want to proceed?"
        )
      ) {
        this.startTask({
          id: `uncommit${id}`,
          message: "uncommitting",
        });
        return uncommitExpense({ id })
          .then(() => {
            this.endTask(`uncommit${id}`);
          })
          .catch((error) => {
            this.endTask(`uncommit${id}`);
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
