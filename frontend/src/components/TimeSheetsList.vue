<template>
  <div id="list">
    <modal ref="rejectModal" />
    <div class="listentry" v-for="item in items" v-bind:key="item.id">
      <div class="anchorbox">
        <router-link :to="[parentPath, item.id, 'details'].join('/')">
          {{ item.weekEnding.toDate() | shortDate }}
        </router-link>
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">
            <template v-if="approved === undefined">
              {{ hoursWorked(item) }}
            </template>
            <template v-else>
              {{ item.displayName }}
            </template>
          </div>
          <div class="byline">
            <template v-if="approved !== undefined">
              {{ hoursWorked(item) }}
            </template>
            / {{ hoursOff(item) }} /
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
          <span v-if="item.rejected" style="color: red">
            Rejected: {{ item.rejectionReason }}
          </span>
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
        <!-- The template for "pending" -->
        <template v-if="approved === false">
          <template v-if="!item.approved && !item.rejected">
            <!--
            <router-link
              v-if="!item.rejected"
              v-bind:to="{ name: 'Time Sheets Pending' }"
              v-on:click.native="approveTs(item.id)"
            >
              <check-circle-icon></check-circle-icon>
            </router-link>
            -->
            <router-link
              v-bind:to="{ name: 'Time Sheets Pending' }"
              v-on:click.native="$refs.rejectModal.openModal(item.id)"
            >
              <x-circle-icon></x-circle-icon>
            </router-link>
          </template>
          <template v-if="item.rejected">
            <span class="label">rejected</span>
          </template>
        </template>

        <!-- The template for "approved" -->
        <template v-if="approved === true">
          <template v-if="!item.locked">
            <router-link
              v-bind:to="{ name: 'Time Sheets Pending' }"
              v-on:click.native="$refs.rejectModal.openModal(item.id)"
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

<script lang="ts">
import Modal from "./Modal.vue";
import Vue from "vue";
import firebase from "../firebase";
import mixins from "./mixins";
import { format } from "date-fns";
import {
  EditIcon,
  SendIcon,
  RewindIcon,
  //CheckCircleIcon,
  XCircleIcon,
} from "vue-feather-icons";
import store from "../store";
const db = firebase.firestore();

export default Vue.extend({
  mixins: [mixins],
  props: ["approved", "collection"],
  components: {
    Modal,
    EditIcon,
    SendIcon,
    RewindIcon,
    //CheckCircleIcon,
    XCircleIcon,
  },
  filters: {
    shortDate(date: Date) {
      return format(date, "MMM dd");
    },
  },
  data() {
    return {
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      items: [],
    };
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.$watch(
      "approved",
      () => {
        if (this.collectionObject === null) {
          throw "There is no valid collection object";
        }
        const uid = store.state.user?.uid;
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
              .orderBy("weekEnding", "desc")
          ).catch((error) => {
            alert(`Can't load Time Sheets: ${error.message}`);
          });
        } else {
          // approved prop is not defined, show this user's own timesheets
          this.$bind(
            "items",
            this.collectionObject
              .where("uid", "==", uid)
              .orderBy("weekEnding", "desc")
          ).catch((error) => {
            alert(`Can't load Time Sheets: ${error.message}`);
          });
        }
      },
      { immediate: true }
    );
  },
  methods: {
    hoursWorked(item: firebase.firestore.DocumentData) {
      let workedHours = 0;
      workedHours += item.workHoursTally.hours;
      workedHours += item.workHoursTally.jobHours;
      if (workedHours > 0) {
        return `${workedHours} hours worked`;
      } else {
        return "no work";
      }
    },
    hoursOff(item: firebase.firestore.DocumentData) {
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
    jobs(item: firebase.firestore.DocumentData) {
      const jobs = Object.keys(item.jobsTally).sort().join(", ");
      if (jobs.length > 0) {
        return `jobs: ${jobs}`;
      } else {
        return;
      }
    },
    divisions(item: firebase.firestore.DocumentData) {
      const divisions = Object.keys(item.divisionsTally).sort().join(", ");
      if (divisions.length > 0) {
        return `divisions: ${divisions}`;
      } else {
        return;
      }
    },
  },
});
</script>
