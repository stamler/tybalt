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
        <div class="thirdline">
          <span v-if="item.rejected" style="color:red;"
            >Rejected: {{ item.rejectionReason }}</span
          >
        </div>
      </div>
      <div class="rowactionsbox">
        <template v-if="approved === undefined">
          <template v-if="!item.submitted">
            <router-link
              v-bind:to="{ name: 'Time Entries' }"
              v-on:click.native="unbundle(item.id)"
            >
              <edit-icon></edit-icon>
            </router-link>
            <router-link
              v-if="!item.rejected"
              v-bind:to="{ name: 'Time Sheets' }"
              v-on:click.native="submitTs(item.id)"
            >
              <send-icon></send-icon>
            </router-link>
          </template>
          <template v-else-if="!item.approved">
            <router-link
              v-if="!item.approved"
              v-bind:to="{ name: 'Time Sheets' }"
              v-on:click.native="recallTs(item.id)"
            >
              <rewind-icon></rewind-icon>
            </router-link>
            <span class="label">submitted</span>
          </template>
          <template v-else>
            <span class="label">approved</span>
          </template>
        </template>

        <template v-if="approved === false">
          <template v-if="!item.approved">
            <router-link
              v-if="!item.rejected"
              v-bind:to="{ name: 'Time Sheets Pending' }"
              v-on:click.native="approveTs(item.id)"
            >
              <check-circle-icon></check-circle-icon>
            </router-link>
            <router-link
              v-bind:to="{ name: 'Time Sheets Pending' }"
              v-on:click.native="rejectTs(item.id)"
            >
              <x-circle-icon></x-circle-icon>
            </router-link>
          </template>
          <template v-else>
            <span class="label">approved</span>
          </template>
        </template>

        <template v-if="approved === true">
          <template v-if="!item.locked">
            <router-link
              v-bind:to="{ name: 'Time Sheets Pending' }"
              v-on:click.native="rejectTs(item.id)"
            >
              <x-circle-icon></x-circle-icon>
            </router-link>
          </template>
        </template>
        <template v-if="item.locked === true">
          <span class="label">locked</span>
        </template>
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
    approveTs(timesheetId) {
      const timesheet = db.collection("TimeSheets").doc(timesheetId);
      return db
        .runTransaction(function(transaction) {
          return transaction.get(timesheet).then(function(tsDoc) {
            if (tsDoc.data().submitted === true) {
              // timesheet is approvable because it has been submitted
              transaction.update(timesheet, { approved: true });
            } else {
              throw "The timesheet has not been submitted or was recalled";
            }
          });
        })
        .catch(function(error) {
          alert(`Approval failed: ${error}`);
        });
    },
    rejectTs(timesheetId) {
      const timesheet = db.collection("TimeSheets").doc(timesheetId);
      return db
        .runTransaction(function(transaction) {
          return transaction.get(timesheet).then(function(tsDoc) {
            if (
              tsDoc.data().submitted === true &&
              tsDoc.data().locked === false
            ) {
              // timesheet is rejectable because it is submitted and not locked
              transaction.update(timesheet, {
                approved: false,
                rejected: true,
                rejectionReason: "no reason provided"
              });
            } else {
              throw "The timesheet has not been submitted or is locked";
            }
          });
        })
        .catch(function(error) {
          alert(`Approval failed: ${error}`);
        });
    },
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
