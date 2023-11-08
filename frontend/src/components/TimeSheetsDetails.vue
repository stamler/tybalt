<template>
  <div>
    <reject-modal ref="rejectModal" collectionName="TimeSheets" />
    <share-modal ref="shareModal" collectionName="TimeSheets" />
    <div>
      {{ item.displayName }} (reports to {{ item.managerName }})

      <span class="label" v-if="isReviewedByMe(item)">reviewed</span>

      <!-- approve button -->
      <action-button
        v-if="
          canApprove(item) &&
          item.submitted === true &&
          item.approved === false &&
          item.rejected === false
        "
        type="approve"
        @click="approveTs(id)"
      />
      <!-- download button -->
      <action-button type="download" @click="generateTimeReportCSV(item)" />

      <!-- submit button -->
      <action-button
        v-if="!item.rejected && belongsToMe(item) && item.submitted === false"
        type="send"
        @click="submitTs(id)"
      />
      <!-- recall button -->
      <action-button
        v-if="
          belongsToMe(item) &&
          item.submitted === true &&
          item.approved === false
        "
        type="recall"
        @click="recallTs(id)"
      />
      <!-- reject button -->
      <action-button
        v-if="
          canReject(item) &&
          item.submitted === true &&
          item.locked === false &&
          item.rejected === false
        "
        type="delete"
        @click="rejectModal?.openModal(id)"
      />
      <!-- share button -->
      <action-button
        v-if="
          canApprove(item) && item.submitted === true && item.locked === false
        "
        type="share"
        @click="shareModal?.openModal(id, item.viewerIds)"
      />
      <!-- review button -->
      <action-button
        v-if="
          canReview(item) &&
          !isReviewedByMe(item) &&
          item.submitted === true &&
          item.locked === false
        "
        type="view"
        @click="reviewTs(id)"
      />
    </div>
    <div v-if="item.weekEnding">
      Sunday {{ shortDate(weekStart) }} to Saturday
      {{ shortDate(item.weekEnding.toDate()) }}
    </div>
    <!-- rejection reason -->
    <span v-if="item.rejected" style="color: red">
      Rejected: {{ item.rejectionReason }}
    </span>
    <div class="horizontalScroll">
      <table>
        <thead>
          <tr>
            <th rowspan="2" style="width: 5em">job #</th>
            <th rowspan="2" style="width: 3em">type</th>
            <th rowspan="2" style="width: 3em">division</th>
            <th rowspan="2" style="width: 4em">date</th>
            <th colspan="3">hours</th>
            <th rowspan="2">request $</th>
            <th rowspan="2">work record</th>
            <th rowspan="2">job description</th>
            <th rowspan="2">work description</th>
          </tr>
          <tr>
            <th>chargeable</th>
            <th>non</th>
            <th>meals</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(entry, index) in sortedEntries" v-bind:key="index">
            <td>{{ entry.job }}</td>
            <td>{{ entry.timetype }}</td>
            <td>{{ entry.division }}</td>
            <td>
              {{ shortDate(entry.date.toDate()) }}
            </td>
            <td>{{ entry.jobHours }}</td>
            <td>{{ entry.hours }}</td>
            <td>{{ entry.mealsHours }}</td>
            <td>{{ entry.payoutRequestAmount }}</td>
            <td>{{ entry.workrecord }}</td>
            <td>{{ entry.client }}:{{ entry.jobDescription }}</td>
            <td>{{ entry.workDescription }}</td>
          </tr>
        </tbody>
        <tfoot v-if="item.workHoursTally !== undefined">
          <tr>
            <td colspan="4">Totals</td>
            <td>{{ item.workHoursTally.jobHours }}</td>
            <td>{{ item.workHoursTally.hours + offHoursSum }}</td>
            <td>{{ item.mealsHoursTally }}</td>
            <td>{{ item.payoutRequest }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

<script lang="ts">
import RejectModal from "./RejectModal.vue";
import ShareModal from "./ShareModal.vue";
import { defineComponent, ref } from "vue";
import {
  shortDate,
  generateTimeReportCSV,
  submitTs,
  recallTs,
} from "./helpers";
import { TimeEntry } from "./types";
import { subWeeks, addMilliseconds } from "date-fns";
import { useStateStore } from "../stores/state";
import { firebaseApp } from "../firebase";
import {
  arrayUnion,
  runTransaction,
  getFirestore,
  collection,
  doc,
  updateDoc,
  CollectionReference,
  DocumentData,
  DocumentSnapshot,
} from "firebase/firestore";
import ActionButton from "./ActionButton.vue";
const db = getFirestore(firebaseApp);

export default defineComponent({
  setup() {
    const rejectModal = ref<typeof RejectModal | null>(null);
    const shareModal = ref<typeof ShareModal | null>(null);
    const store = useStateStore();
    const { startTask, endTask } = store;
    return {
      rejectModal,
      shareModal,
      startTask,
      endTask,
      claims: store.claims,
      user: store.user,
    };
  },
  components: {
    ActionButton,
    RejectModal,
    ShareModal,
  },
  props: ["id", "collectionName"],
  computed: {
    offHoursSum(): number {
      let total = 0;
      if (this.item !== undefined) {
        for (const code in this.item.nonWorkHoursTally) {
          total += this.item.nonWorkHoursTally[code];
        }
      }
      return total;
    },
    weekStart(): Date {
      if (this.item?.weekEnding !== undefined) {
        return addMilliseconds(subWeeks(this.item.weekEnding.toDate(), 1), 1);
      } else {
        return new Date();
      }
    },
    sortedEntries(): TimeEntry[] {
      const input = this.item?.entries;
      if (input && input.length > 0) {
        return input.slice().sort((a: TimeEntry, b: TimeEntry) => {
          return a.date.toDate().getTime() - b.date.toDate().getTime();
        });
      }
      return [];
    },
  },
  data() {
    return {
      rejectionReason: "",
      parentPath: "",
      collectionObject: null as CollectionReference | null,
      item: {} as DocumentData,
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
    generateTimeReportCSV,
    submitTs,
    recallTs,
    setItem(id: string) {
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }
      if (id) {
        this.$firestoreBind("item", doc(this.collectionObject, id)).catch(
          (error: unknown) => {
            if (error instanceof Error) {
              alert(
                `Can't load ${this.collectionName} document ${id}: ${error.message}`
              );
            } else
              alert(
                `Can't load ${
                  this.collectionName
                } document ${id}: ${JSON.stringify(error)}`
              );
          }
        );
      } else {
        this.item = {};
      }
    },
    async approveTs(timesheetId: string) {
      this.startTask({
        id: `approve${timesheetId}`,
        message: "approving",
      });
      const timesheet = doc(collection(db, "TimeSheets"), timesheetId);
      return runTransaction(db, async (transaction) => {
        return transaction.get(timesheet).then((tsDoc: DocumentSnapshot) => {
          if (!tsDoc.exists) {
            throw `A timesheet with id ${timesheetId} doesn't exist.`;
          }
          const data = tsDoc?.data() ?? undefined;
          if (data !== undefined && data.submitted === true) {
            // timesheet is approvable because it has been submitted
            transaction.update(timesheet, { approved: true });
          } else {
            throw "The timesheet has not been submitted";
          }
        });
      })
        .then(() => {
          this.endTask(`approve${timesheetId}`);
          this.$router.push({ name: "Time Sheets" });
        })
        .catch((error) => {
          this.endTask(`approve${timesheetId}`);
          alert(`Approval failed: ${error}`);
        });
    },
    reviewTs(timesheetId: string) {
      this.startTask({
        id: `review${timesheetId}`,
        message: "marking reviewed",
      });
      updateDoc(doc(collection(db, "TimeSheets"), timesheetId), {
        reviewedIds: arrayUnion(this.user.uid),
      })
        .then(() => {
          this.endTask(`review${timesheetId}`);
        })
        .catch((error) => {
          this.endTask(`review${timesheetId}`);
          alert(`Error marking timesheet as reviewed: ${error}`);
        });
    },
    belongsToMe(item: DocumentData) {
      return this.user.uid === item.uid;
    },
    canApprove(item: DocumentData): boolean {
      return (
        Object.prototype.hasOwnProperty.call(this.claims, "tapr") &&
        this.claims["tapr"] === true &&
        this.user.uid === item.managerUid
      );
    },
    isReviewedByMe(item: DocumentData): boolean {
      return item.reviewedIds && item.reviewedIds.includes(this.user.uid);
    },
    canReview(item: DocumentData): boolean {
      return (
        Object.prototype.hasOwnProperty.call(this.claims, "tapr") &&
        this.claims["tapr"] === true &&
        item.viewerIds &&
        item.viewerIds.includes(this.user.uid)
      );
    },
    canReject(item: DocumentData): boolean {
      return (
        this.canApprove(item) ||
        (Object.prototype.hasOwnProperty.call(this.claims, "tsrej") &&
          this.claims["tsrej"] === true)
      );
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
