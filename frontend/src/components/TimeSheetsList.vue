<template>
  <div id="list">
    <div class="listentry" v-for="item in items" v-bind:key="item.id">
      <div class="anchorbox">{{ item.week_ending.toDate() | shortDate }}</div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">{{ hoursWorked(item) }}</div>
          <div class="byline">{{ hoursOff(item) }}</div>
        </div>
        <div class="firstline">{{ jobs(item) }}</div>
        <div class="secondline"></div>
        <div class="thirdline"></div>
      </div>
      <div class="rowactionsbox">
        <router-link
          v-if="!item.submitted"
          v-bind:to="{ name: 'Time Entries' }"
          v-on:click.native="unbundle(item.id)"
        >
          <edit-icon></edit-icon>
        </router-link>
        <router-link
          v-else
          v-bind:to="{ name: 'Time Sheets' }"
          v-on:click.native="recallTs(item.id)"
        >
          <rewind-icon></rewind-icon>
        </router-link>
        <span v-if="item.submitted" class="label">submitted</span>
        <router-link v-else to="#" v-on:click.native="submitTs(item.id)">
          <send-icon></send-icon>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script>
import moment from "moment";
import { EditIcon, SendIcon, RewindIcon } from "vue-feather-icons";
import firebase from "@/firebase";

export default {
  components: {
    EditIcon,
    SendIcon,
    RewindIcon
  },
  filters: {
    shortDate(date) {
      return moment(date).format("MMM DD");
    },
    hoursString(item) {
      const hoursArray = [];
      if (item.hours) hoursArray.push(item.hours + " hrs");
      if (item.jobHours) hoursArray.push(item.jobHours + " job hrs");
      if (item.mealsHours) hoursArray.push(item.mealsHours + " hrs meals");
      return hoursArray.join(" + ");
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
    this.items = this.$parent.items;
  },
  methods: {
    unbundle(timesheetId) {
      console.log(`unbundling TimeSheet ${timesheetId}`);
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
          console.log(err);
        });
    },
    recallTs(timesheetId) {
      // TODO: Iff this gets defined later:
      // A transaction should be used to update the submitted field by
      // first verifying that approved is false. Similarly an approve
      // function for the approving manager must use a transaction and
      // verify that the timesheet is submitted before marking it approved
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
      return Object.keys(item.projectsTally).join(", ");
    }
  }
};
</script>
