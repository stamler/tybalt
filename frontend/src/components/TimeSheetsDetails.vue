<template>
  <div>
    <reject-modal ref="rejectModal" collection="TimeSheets" />
    <share-modal ref="shareModal" collection="TimeSheets" />
    <div>
      {{ item.displayName }} (reports to {{ item.managerName }})

      <span class="label" v-if="isReviewedByMe(item)">reviewed</span>

      <!-- approve button -->
      <router-link
        v-if="
          canApprove(item) &&
          item.submitted === true &&
          item.approved === false &&
          item.rejected === false
        "
        v-bind:to="{ name: 'Time Sheets' }"
        v-on:click.native="approveTs(id)"
      >
        <check-circle-icon></check-circle-icon>
      </router-link>
      <!-- submit button -->
      <router-link
        v-if="!item.rejected && belongsToMe(item) && item.submitted === false"
        v-bind:to="{ name: 'Time Sheets' }"
        v-on:click.native="submitTs(id)"
      >
        <send-icon></send-icon>
      </router-link>
      <!-- recall button -->
      <router-link
        v-if="
          belongsToMe(item) &&
          item.submitted === true &&
          item.approved === false
        "
        v-bind:to="{ name: 'Time Sheets' }"
        v-on:click.native="recallTs(id)"
      >
        <rewind-icon></rewind-icon>
      </router-link>
      <!-- reject button -->
      <router-link
        v-if="
          canReject(item) &&
          item.submitted === true &&
          item.locked === false &&
          item.rejected === false
        "
        v-bind:to="{ name: 'Time Sheet Details', params: { id, collection } }"
        v-on:click.native="$refs.rejectModal.openModal(id)"
      >
        <x-circle-icon></x-circle-icon>
      </router-link>
      <!-- share button -->
      <router-link
        v-if="
          canApprove(item) && item.submitted === true && item.locked === false
        "
        v-bind:to="{ name: 'Time Sheet Details', params: { id, collection } }"
        v-on:click.native="$refs.shareModal.openModal(id, item.viewerIds)"
      >
        <share-icon></share-icon>
      </router-link>
      <!-- review button -->
      <router-link
        v-if="
          canReview(item) &&
          !isReviewedByMe(item) &&
          item.submitted === true &&
          item.locked === false
        "
        v-bind:to="{ name: 'Time Sheet Details', params: { id, collection } }"
        v-on:click.native="reviewTs(id)"
      >
        <eye-icon></eye-icon>
      </router-link>
    </div>
    <div v-if="item.weekEnding">
      Sunday {{ weekStart | shortDate }} to Saturday
      {{ item.weekEnding.toDate() | shortDate }}
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
              {{ entry.date.toDate() | shortDate }}
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
import mixins from "./mixins";
import { TimeEntry } from "./types";
import { format, subWeeks, addMilliseconds } from "date-fns";
import { mapState } from "vuex";
import firebase from "../firebase";
import {
  SendIcon,
  EyeIcon,
  RewindIcon,
  CheckCircleIcon,
  ShareIcon,
  XCircleIcon,
} from "vue-feather-icons";
const db = firebase.firestore();

export default mixins.extend({
  components: {
    RejectModal,
    ShareModal,
    ShareIcon,
    EyeIcon,
    SendIcon,
    RewindIcon,
    CheckCircleIcon,
    XCircleIcon,
  },
  props: ["id", "collection"],
  computed: {
    ...mapState(["user", "claims"]),
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
      collectionObject: null as firebase.firestore.CollectionReference | null,
      item: {} as firebase.firestore.DocumentData | undefined,
    };
  },
  filters: {
    shortDate(date: Date) {
      return format(date, "MMM dd");
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
        this.$bind("item", this.collectionObject.doc(id)).catch((error) => {
          alert(
            `Can't load ${this.collection} document ${id}: ${error.message}`
          );
        });
      } else {
        this.item = {};
      }
    },
    belongsToMe(item: firebase.firestore.DocumentData) {
      return this.user.uid === item.uid;
    },
    canApprove(item: firebase.firestore.DocumentData): boolean {
      return (
        Object.prototype.hasOwnProperty.call(this.claims, "tapr") &&
        this.claims["tapr"] === true &&
        this.user.uid === item.managerUid
      );
    },
    isReviewedByMe(item: firebase.firestore.DocumentData): boolean {
      return item.reviewedIds && item.reviewedIds.includes(this.user.uid);
    },
    canReview(item: firebase.firestore.DocumentData): boolean {
      return (
        Object.prototype.hasOwnProperty.call(this.claims, "tapr") &&
        this.claims["tapr"] === true &&
        item.viewerIds &&
        item.viewerIds.includes(this.user.uid)
      );
    },
    canReject(item: firebase.firestore.DocumentData): boolean {
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
