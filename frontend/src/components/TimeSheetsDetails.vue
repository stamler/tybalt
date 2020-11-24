<template>
  <div>
    <div>
      {{ item.displayName }} (reports to {{ item.managerName }})
      <router-link
        v-if="
          canApprove() && item.submitted === true && item.approved === false
        "
        v-bind:to="{ name: 'Time Sheets' }"
        v-on:click.native="approveTs(id)"
      >
        <check-circle-icon></check-circle-icon>
      </router-link>
      <router-link
        v-if="!item.rejected && belongsToMe(item) && item.submitted === false"
        v-bind:to="{ name: 'Time Sheets' }"
        v-on:click.native="submitTs(id)"
      >
        <send-icon></send-icon>
      </router-link>
      <router-link
        v-if="canApprove() && item.submitted === true && item.locked === false"
        v-bind:to="{ name: 'Time Sheets' }"
        v-on:click.native="rejectTs(id)"
      >
        <x-circle-icon></x-circle-icon>
      </router-link>
    </div>
    <div v-if="item.weekEnding">
      Sunday {{ weekStart | shortDate }} to Saturday
      {{ item.weekEnding.toDate() | shortDate }}
    </div>
    <table>
      <thead>
        <tr>
          <th rowspan="2">job/proposal</th>
          <th rowspan="2">time type</th>
          <th rowspan="2">date</th>
          <th colspan="3">hours</th>
          <th rowspan="2">work record</th>
          <th rowspan="2">job</th>
          <th rowspan="2">notes</th>
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
          <td>{{ entry.workrecord }}</td>
          <td>{{ entry.client }}:{{ entry.jobDescription }}</td>
          <td>{{ entry.notes }}</td>
        </tr>
      </tbody>
      <tfoot v-if="item.workHoursTally !== undefined">
        <tr>
          <td colspan="3">Totals</td>
          <td>{{ item.workHoursTally.jobHours }}</td>
          <td>{{ item.workHoursTally.hours + offHoursSum }}</td>
          <td>{{ item.mealsHoursTally }}</td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>

<script lang="ts">
import Vue from "vue";
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

export default Vue.extend({
  mixins: [mixins],
  components: {
    SendIcon,
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
