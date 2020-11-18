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
          <div class="byline">
            {{ hoursOff(item) }}
            <span v-if="item.offRotationDaysTally > 0">
              {{ item.offRotationDaysTally }} day(s) off rotation
            </span>
            <span v-if="item.bankedHours > 0">
              / {{ item.bankedHours }} hours banked
            </span>
          </div>
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
import mixins from "./mixins";
import { format } from "date-fns";
import {
  EditIcon,
  SendIcon,
  RewindIcon,
  CheckCircleIcon,
  XCircleIcon
} from "vue-feather-icons";
import store from "../store";

export default {
  mixins: [mixins],
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
    hoursWorked(item) {
      let workedHours = 0;
      workedHours += item.workHoursTally.hours;
      workedHours += item.workHoursTally.jobHours;
      if (workedHours > 0) {
        return `${workedHours} hours worked`;
      } else {
        return "no work";
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
        return "no time off";
      }
    },
    jobs(item) {
      const jobs = Object.keys(item.jobsTally)
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
