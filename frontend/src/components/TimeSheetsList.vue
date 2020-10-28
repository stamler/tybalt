<template>
  <div id="list">
    <div class="listentry" v-for="item in items" v-bind:key="item.id">
      <div class="anchorbox">
        <router-link :to="[parentPath, item.id, 'details'].join('/')">
          {{ item.weekEnding.toDate() | shortDate }}
        </router-link>
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">{{ hoursWorked(item) }}</div>
          <div class="byline">{{ hoursOff(item) }}</div>
        </div>
        <div class="firstline">{{ jobs(item) }}</div>
        <div class="secondline">{{ divisions(item) }}</div>
        <div class="thirdline"></div>
      </div>
      <div class="rowactionsbox">
        <!-- Button Label group 1 -->
        <router-link
          v-if="!item.submitted"
          v-bind:to="{ name: 'Time Entries' }"
          v-on:click.native="unbundle(item.id)"
        >
          <edit-icon></edit-icon>
        </router-link>
        <router-link
          v-else-if="!item.approved && approved === undefined"
          v-bind:to="{ name: 'Time Sheets' }"
          v-on:click.native="recallTs(item.id)"
        >
          <rewind-icon></rewind-icon>
        </router-link>
        <router-link
          v-else-if="!item.approved && approved === false"
          v-bind:to="{ name: 'Time Sheets Pending' }"
          v-on:click.native="approveTs(item.id)"
        >
          <check-circle-icon></check-circle-icon>
        </router-link>
        <span v-else class="label">approved</span>

        <!-- Button Label group 2 -->
        <span v-if="item.submitted && approved === undefined" class="label">
          submitted
        </span>
        <router-link
          v-else-if="!item.submitted && approved === undefined"
          to="#"
          v-on:click.native="submitTs(item.id)"
        >
          <send-icon></send-icon>
        </router-link>
        <router-link
          v-else-if="item.submitted && approved === false"
          v-bind:to="{ name: 'Time Sheets Pending' }"
        >
          <x-circle-icon></x-circle-icon>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script>
import { format } from "date-fns";
import {
  EditIcon,
  SendIcon,
  RewindIcon,
  CheckCircleIcon,
  XCircleIcon
} from "vue-feather-icons";
import firebase from "@/firebase";
import store from "../store";
const db = firebase.firestore();

export default {
  props: ["approved"],
  components: {
    EditIcon,
    SendIcon,
    RewindIcon,
    CheckCircleIcon,
    XCircleIcon
  },
  filters: {
    shortDate(date) {
      return format(date, "MMM dd");
    }
  },
  data() {
    return {
      parentPath: null,
      collection: null, // collection: a reference to the parent collection
      items: []
    };
  },
  created() {
    this.parentPath = this.$route.matched[
      this.$route.matched.length - 1
    ].parent.path;
    this.collection = this.$parent.collection;
    this.$watch(
      "approved",
      () => {
        if (this.approved === true || this.approved === false) {
          this.$bind(
            "items",
            this.collection
              .where("managerUid", "==", store.state.user.uid)
              .where("approved", "==", this.approved)
              .where("submitted", "==", true)
              .orderBy("weekEnding", "desc")
          ).catch(error => {
            alert(`Can't load Time Sheets: ${error.message}`);
          });
        } else {
          this.$bind(
            "items",
            this.collection
              .where("uid", "==", store.state.user.uid)
              .orderBy("weekEnding", "desc")
          ).catch(error => {
            alert(`Can't load Time Sheets: ${error.message}`);
          });
        }
      },
      { immediate: true }
    );
  },
  methods: {
    unbundle(timesheetId) {
      const unbundleTimesheet = firebase
        .functions()
        .httpsCallable("unbundleTimesheet");
      return unbundleTimesheet({ id: timesheetId }).catch(error => {
        alert(`Error unbundling timesheet: ${error.message}`);
      });
    },
    submitTs(timesheetId) {
      this.collection
        .doc(timesheetId)
        .set({ submitted: true }, { merge: true })
        .catch(err => {
          alert(`Error submitting timesheet: ${err}`);
        });
    },
    approveTs(timesheetId) {},
    recallTs(timesheetId) {
      // A transaction is used to update the submitted field by
      // first verifying that approved is false. Similarly an approve
      // function for the approving manager must use a transaction and
      // verify that the timesheet is submitted before marking it approved
      const timesheet = db.collection("TimeSheets").doc(timesheetId);

      return db
        .runTransaction(function(transaction) {
          return transaction.get(timesheet).then(function(tsDoc) {
            if (tsDoc.data().approved === false) {
              // timesheet is recallable because it hasn't yet been approved
              transaction.update(timesheet, { submitted: false });
            } else {
              throw "The timesheet was already approved by a manager";
            }
          });
        })
        .catch(function(error) {
          alert(`Recall failed: ${error}`);
        });
    },
    hoursWorked(item) {
      let workedHours = 0;
      workedHours += item.workHoursTally.hours;
      workedHours += item.workHoursTally.jobHours;
      if (workedHours > 0) {
        return `${workedHours} hours worked`;
      } else {
        return "no work in this period";
      }
    },
    hoursOff(item) {
      let hoursOff = 0;
      for (const timetype in item.nonWorkHoursTally) {
        hoursOff += item.nonWorkHoursTally[timetype];
      }
      if (hoursOff > 0) {
        return `${hoursOff} hours off`;
      } else {
        return "no time off in this period";
      }
    },
    jobs(item) {
      const jobs = Object.keys(item.projectsTally)
        .sort()
        .join(", ");
      if (jobs.length > 0) {
        return `jobs: ${jobs}`;
      } else {
        return;
      }
    },
    divisions(item) {
      const divisions = Object.keys(item.divisionsTally)
        .sort()
        .join(", ");
      if (divisions.length > 0) {
        return `divisions: ${divisions}`;
      } else {
        return;
      }
    }
  }
};
</script>
