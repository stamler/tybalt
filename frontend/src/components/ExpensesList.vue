<template>
  <div id="list">
    <modal ref="rejectModal" collection="Expenses" />
    <div
      v-for="(expenses, weekEnding) in processedItems"
      v-bind:key="weekEnding"
    >
      <span class="listheader">
        Week Ending
        {{ shortDate(new Date(parseInt(weekEnding, 10))) }}
        <action-button
          v-if="unsubmittedExpenseIds(expenses).length > 0"
          type="send"
          @click="submitExpenses(unsubmittedExpenseIds(expenses))"
        />
      </span>
      <div
        class="listentry"
        v-for="item in expenses"
        v-bind:key="item.id"
        v-bind:class="{
          reimbursable: [
            'Mileage',
            'Allowance',
            'Expense',
            'PersonalReimbursement',
          ].includes(item.paymentType),
        }"
      >
        <div class="anchorbox">
          {{ shortDate(item.date.toDate()) }}
        </div>
        <div class="detailsbox">
          <div class="headline_wrapper">
            <div class="headline">
              <template v-if="approved === undefined">
                <template
                  v-if="!['Meals', 'Allowance'].includes(item.paymentType)"
                >
                  {{ item.description }}
                </template>
                <template v-else>
                  {{ item.breakfast ? "Breakfast" : "" }}
                  {{ item.lunch ? "Lunch" : "" }}
                  {{ item.dinner ? "Dinner" : "" }}
                  {{ item.lodging ? "Personal Accommodation" : "" }}
                </template>
              </template>
              <template v-else>
                {{ item.displayName }}
              </template>
            </div>
            <div class="byline" v-if="item.paymentType === 'Mileage'">
              {{ item.distance }} km
            </div>
            <div
              class="byline"
              v-else-if="['Meals', 'Allowance'].includes(item.paymentType)"
            >
              <template v-if="typeof approved === 'boolean'">
                {{ item.breakfast ? "Breakfast" : "" }}
                {{ item.lunch ? "Lunch" : "" }}
                {{ item.dinner ? "Dinner" : "" }}
                {{ item.lodging ? "Personal Accommodation" : "" }}
              </template>
            </div>
            <div class="byline" v-else>
              ${{ item.total }}
              <span v-if="item.po">/PO:{{ item.po }}</span>
              <span v-if="item.vendorName">/vendor: {{ item.vendorName }}</span>
            </div>
          </div>
          <div class="firstline">
            <template v-if="approved !== undefined">
              {{ item.description }}
            </template>
          </div>
          <div class="secondline">
            <template v-if="item.job !== undefined">
              {{ item.job }} {{ item.jobDescription }} for {{ item.client }}
            </template>
            <template v-if="item.attachment">
              <action-button
                type="download"
                @click="downloadAttachment(item)"
              />
            </template>
            <template v-if="approved === true">
              approved by {{ item.managerName }}
            </template>
          </div>
          <div class="thirdline">
            <span
              class="label"
              v-if="item.paymentType === 'CorporateCreditCard'"
            >
              Corporate Credit Card *{{ item.ccLast4digits }}
            </span>
            <span class="label" v-if="item.paymentType === 'FuelCard'">
              Fuel Card *{{ item.ccLast4digits }}
            </span>
            <span class="label" v-if="item.paymentType === 'FuelOnAccount'">
              Fuel on Account for unit {{ item.unitNumber }}
            </span>
            <span v-if="item.rejected" style="color: red">
              Rejected: {{ item.rejectionReason }}
            </span>
          </div>
        </div>
        <div class="rowactionsbox">
          <template
            v-if="
              item.committed === true &&
              [
                'Mileage',
                'Allowance',
                'Expense',
                'Meals',
                'PersonalReimbursement',
              ].includes(item.paymentType)
            "
          >
            <span
              v-if="
                item.payPeriodEnding &&
                item.payPeriodEnding.toDate().getTime() >
                  originalPayPeriod(item)
              "
              v-bind:title="lateCommitMessage(item)"
              class="attention"
            >
              <clock-icon></clock-icon>
            </span>
            <span
              v-else
              style="color: rgba(16, 200, 214, 1)"
              v-bind:title="commitMessage(item)"
            >
              <dollar-sign-icon></dollar-sign-icon>
            </span>
          </template>
          <!-- The template for users -->
          <template v-if="approved === undefined">
            <template v-if="item.submitted === false">
              <action-button
                v-if="!item.attachment"
                type="copy"
                @click="copyEntry(item, collectionObject)"
                title="copy to tomorrow"
              />
              <action-button
                type="delete"
                @click="del(item, collectionObject)"
              />
              <router-link :to="[parentPath, item.id, 'edit'].join('/')">
                <edit-icon></edit-icon>
              </router-link>
              <action-button type="send" @click="submitExpense(item.id)" />
            </template>

            <template v-if="item.submitted === true && item.approved === false">
              <action-button type="recall" @click="recallExpense(item.id)" />
              <span class="label">submitted</span>
            </template>

            <template v-if="item.submitted === true && item.approved === true">
              <span v-if="item.committed === false" class="label">
                approved
              </span>
              <span v-else class="label">committed</span>
            </template>
          </template>

          <!-- The template for "pending" -->
          <template v-if="approved === false">
            <template v-if="!item.approved && !item.rejected">
              <action-button type="approve" @click="approveExpense(item.id)" />
              <action-button
                v-if="!item.approved && !item.rejected"
                type="delete"
                @click="$refs.rejectModal.openModal(item.id)"
              />
            </template>
            <template v-if="item.rejected">
              <span class="label">rejected</span>
            </template>
          </template>

          <!-- The template for "approved" -->
          <template v-if="approved === true">
            <template v-if="!item.committed">
              <action-button
                type="delete"
                @click="$refs.rejectModal.openModal(item.id)"
              />
            </template>
            <template v-if="item.committed">
              <span class="label">committed</span>
            </template>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import {
  shortDate,
  thisTimeNextWeekInTimeZone,
  nextSaturday,
  isPayrollWeek2,
  submitExpense,
  copyEntry,
  del,
  downloadAttachment,
} from "./helpers";
import Modal from "./RejectModal.vue";
import firebase from "../firebase";
import Vue from "vue";
import { format, addDays } from "date-fns";
import _ from "lodash";
import ActionButton from "./ActionButton.vue";
import { EditIcon, ClockIcon, DollarSignIcon } from "vue-feather-icons";
import { useStateStore } from "../stores/state";
const db = firebase.firestore();

export default Vue.extend({
  setup() {
    const store = useStateStore();
    const { startTask, endTask } = store;
    return { user: store.user, startTask, endTask };
  },
  props: ["approved", "collection"],
  computed: {
    processedItems(): { [uid: string]: firebase.firestore.DocumentData[] } {
      return _.groupBy(this.items, (x) =>
        nextSaturday(x.date.toDate()).getTime()
      );
    },
  },
  components: {
    ActionButton,
    Modal,
    EditIcon,
    ClockIcon,
    DollarSignIcon,
  },
  data() {
    return {
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      items: [] as firebase.firestore.DocumentData[],
    };
  },
  methods: {
    shortDate,
    copyEntry,
    del,
    downloadAttachment,
    submitExpense,
    recallExpense(expenseId: string) {
      // A transaction is used to update the submitted field by
      // first verifying that approved is false. Similarly an approve
      // function for the approving manager must use a transaction and
      // verify that the timesheet is submitted before marking it approved
      this.startTask({
        id: `recall${expenseId}`,
        message: "recalling",
      });
      const expense = db.collection("Expenses").doc(expenseId);

      return db
        .runTransaction(function (transaction) {
          return transaction
            .get(expense)
            .then((tsDoc: firebase.firestore.DocumentSnapshot) => {
              if (!tsDoc.exists) {
                throw `An expense with id ${expenseId} doesn't exist.`;
              }
              const data = tsDoc?.data() ?? undefined;
              if (data !== undefined && data.approved === false) {
                // timesheet is recallable because it hasn't yet been approved
                transaction.update(expense, { submitted: false });
              } else {
                throw "The expense was already approved by a manager";
              }
            });
        })
        .then(() => {
          this.endTask(`recall${expenseId}`);
        })
        .catch((error) => {
          this.endTask(`recall${expenseId}`);
          alert(`Recall failed: ${error}`);
        });
    },
    approveExpense(itemId: string) {
      this.startTask({
        id: `approve${itemId}`,
        message: "approving",
      });
      const item = db.collection("Expenses").doc(itemId);
      return db
        .runTransaction(function (transaction) {
          return transaction
            .get(item)
            .then((tsDoc: firebase.firestore.DocumentSnapshot) => {
              if (!tsDoc.exists) {
                throw `An expense with id ${itemId} doesn't exist.`;
              }
              const data = tsDoc?.data() ?? undefined;
              if (data !== undefined && data.submitted === true) {
                // timesheet is approvable because it has been submitted
                transaction.update(item, { approved: true, committed: false });
              } else {
                throw "The expense has not been submitted";
              }
            });
        })
        .then(() => {
          this.endTask(`approve${itemId}`);
          this.$router.push({ name: "Expenses Pending" });
        })
        .catch((error) => {
          this.endTask(`approve${itemId}`);
          alert(`Approval failed: ${error}`);
        });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unsubmittedExpenseIds(expenses: any[]) {
      return expenses.filter((x) => x.submitted !== true).map((x) => x.id);
    },
    async submitExpenses(expenses: string[]) {
      for (const id of expenses) {
        await submitExpense(id);
      }
    },
    commitMessage(item: firebase.firestore.DocumentData) {
      if (item.payPeriodEnding) {
        return `Reimbursed on ${format(
          addDays(item.payPeriodEnding.toDate(), 13),
          "MMM dd"
        )} for pay period ending ${format(
          item.payPeriodEnding.toDate(),
          "MMM dd"
        )}`;
      } else {
        return "Reimbused on payroll";
      }
    },
    lateCommitMessage(item: firebase.firestore.DocumentData) {
      return `Committed ${format(
        item.commitTime.toDate(),
        "MMM dd"
      )}, reimbursed on ${format(
        addDays(item.payPeriodEnding.toDate(), 13),
        "MMM dd"
      )} for pay period ending ${format(
        item.payPeriodEnding.toDate(),
        "MMM dd"
      )}`;
    },
    originalPayPeriod(item: firebase.firestore.DocumentData) {
      const date = nextSaturday(item.date.toDate());
      if (isPayrollWeek2(date)) {
        return date;
      } else {
        return thisTimeNextWeekInTimeZone(date, "America/Thunder_Bay");
      }
    },
    updateItems() {
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }
      const uid = this.user.uid;
      if (uid === undefined) {
        throw "There is no valid uid";
      }
      if (typeof this.approved === "boolean") {
        // approved prop is defined, show pending or approved TimeSheets
        // belonging to users that this user manages
        this.$bind(
          "items",
          this.collectionObject
            .where("managerUid", "==", uid)
            .where("approved", "==", this.approved)
            .where("submitted", "==", true)
            .orderBy("date", "desc")
        ).catch((error: unknown) => {
          if (error instanceof Error) {
            alert(`Can't load Expenses: ${error.message}`);
          } else alert(`Can't load Expenses: ${JSON.stringify(error)}`);
        });
      } else {
        // approved prop not defined, get user's own expenses
        this.$bind(
          "items",
          this.collectionObject.where("uid", "==", uid).orderBy("date", "desc")
        ).catch((error: unknown) => {
          if (error instanceof Error) {
            alert(`Can't load Expenses: ${error.message}`);
          } else alert(`Can't load Expenses: ${JSON.stringify(error)}`);
        });
      }
    },
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.$watch("approved", this.updateItems, { immediate: true });
  },
});
</script>
<style scoped>
.reimbursable {
  background-color: rgb(232, 255, 232);
}
</style>
