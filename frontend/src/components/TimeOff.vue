<template>
  <div>
    <template v-if="profile.untrackedTimeOff !== true">
      <h1>Your Available Time Off</h1>
      <table>
        <thead>
          <tr>
            <!-- <th>Since</th> -->
            <th>Last</th>
            <th>Vacation</th>
            <th>PPTO</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <!-- <td>{{ formatDate(profile.openingDateTimeOff.toDate()) }}</td> -->
            <td>{{ formatDate(profile.usedAsOf.toDate()) }}</td>
            <td>{{ profile.openingOV - profile.usedOV }}</td>
            <td>{{ profile.openingOP - profile.usedOP }}</td>
          </tr>
        </tbody>
      </table>
    </template>
    <template v-else>
      <p>Your time off is not tracked</p>
    </template>

    <template v-if="claims.tapr">
      <h1>Your Reports</h1>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <!-- <th>Since</th> -->
            <th>Last</th>
            <th>Vacation</th>
            <th>PPTO</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="report in reports" v-bind:key="report.id">
            <td>{{ report.displayName }}</td>
            <!-- <td>{{ formatDate(report.openingDateTimeOff.toDate()) }}</td> -->
            <td>{{ formatDate(report.usedAsOf.toDate()) }}</td>
            <td>{{ report.openingOV - report.usedOV }}</td>
            <td>{{ report.openingOP - report.usedOP }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>

<script lang="ts">
import Vue from "vue";
import { mapState } from "vuex";
import firebase from "../firebase";
import { format } from "date-fns";
const db = firebase.firestore();

export default Vue.extend({
  computed: {
    ...mapState(["user", "claims"]),
  },
  data() {
    return {
      profile: {},
      reports: [],
    };
  },
  created() {
    this.$bind("profile", db.collection("Profiles").doc(this.user?.uid));
    this.$bind(
      "reports",
      db.collection("Profiles").where("managerUid", "==", this.user?.uid)
    );
  },
  methods: {
    formatDate(date: Date) {
      return format(date, "yyyy MMM dd");
    },
  },
});
</script>
<style scoped>
th,
td,
tr {
  text-align: left;
  background-color: lightgray;
}
</style>
