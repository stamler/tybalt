<template>
  <div>
    <modal ref="rejectModal">
      <template v-slot:header>
        <h1>Reject</h1>
      </template>

      <template v-slot:body>
        <p>What's wrong with this time sheet?</p>
        <textarea id="rejectionInput" v-model="rejectionReason"></textarea>
      </template>

      <template v-slot:footer>
        <div>
          <button v-on:click="$refs.rejectModal.closeModal()">
            Cancel
          </button>
          <button v-on:click="rejectThenRedirect()">
            Reject
          </button>
        </div>
      </template>
    </modal>
    <div>
      {{ item.displayName }} (reports to {{ item.managerName }})
      <!-- approve button -->
      <router-link
        v-if="
          canApprove() &&
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
          canApprove() &&
            item.submitted === true &&
            item.locked === false &&
            item.rejected === false
        "
        v-bind:to="{ name: 'Time Sheet Details', params: { id, collection } }"
        v-on:click.native="$refs.rejectModal.openModal()"
      >
        <x-circle-icon></x-circle-icon>
      </router-link>
    </div>
    <div v-if="item.weekEnding">
      Sunday {{ weekStart | shortDate }} to Saturday
      {{ item.weekEnding.toDate() | shortDate }}
    </div>
    <!-- rejection reason -->
    <span v-if="item.rejected" style="color:red;">
      Rejected: {{ item.rejectionReason }}
    </span>
    <table>
      <thead>
        <tr>
          <th rowspan="2">job/proposal</th>
          <th rowspan="2">time type</th>
          <th rowspan="2">date</th>
          <th colspan="3">hours</th>
          <th rowspan="2">request $</th>
          <th rowspan="2">work record</th>
          <th rowspan="2">job</th>
          <th rowspan="2">work description</th>
        </tr>
        <tr>
          <th>job</th>
          <th>non</th>
          <th>meals</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(entry, index) in item.entries" v-bind:key="index">
          <td>{{ entry.job }}</td>
          <td>{{ entry.timetype }}</td>
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
          <td colspan="3">Totals</td>
          <td>{{ item.workHoursTally.jobHours }}</td>
          <td>{{ item.workHoursTally.hours + offHoursSum }}</td>
          <td>{{ item.mealsHoursTally }}</td>
          <td>{{ item.payoutRequest }}</td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>

<script lang="ts">
import Modal from "./Modal.vue";
import mixins from "./mixins";
import { format, subWeeks, addMilliseconds } from "date-fns";
import { mapState } from "vuex";
import firebase from "../firebase";
import {
  SendIcon,
  RewindIcon,
  CheckCircleIcon,
  XCircleIcon
} from "vue-feather-icons";
const db = firebase.firestore();

export default mixins.extend({
  components: {
    Modal,
    SendIcon,
    RewindIcon,
    CheckCircleIcon,
    XCircleIcon
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
    }
  },
  data() {
    return {
      rejectionReason: "",
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      item: {} as firebase.firestore.DocumentData | undefined
    };
  },
  filters: {
    shortDate(date: Date) {
      return format(date, "MMM dd");
    }
  },
  watch: {
    id: function(id: string) {
      this.setItem(id);
    } // first arg is newVal, second is oldVal
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.setItem(this.id);
  },
  methods: {
    async rejectThenRedirect() {
      await this.rejectTs(this.id, this.rejectionReason);
      // TODO: remove any on next line
      (this.$refs.rejectModal as any).closeModal();
      this.$router.push(this.parentPath);
    },
    setItem(id: string) {
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }
      if (id) {
        this.collectionObject
          .doc(id)
          .get()
          .then(snap => {
            if (snap.exists) {
              this.item = snap.data();
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
    belongsToMe(item: firebase.firestore.DocumentData) {
      return this.user.uid === item.uid;
    },
    canApprove(): boolean {
      return (
        Object.prototype.hasOwnProperty.call(this.claims, "tapr") &&
        this.claims["tapr"] === true
      );
    }
  }
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
