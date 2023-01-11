<template>
  <div>
    <template v-if="profile.untrackedTimeOff !== true">
      <h1>Your Available Time Off</h1>
      <table>
        <thead>
          <tr>
            <th>Last</th>
            <th>Vacation</th>
            <th>PPTO</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{{ formatDate(profile.usedAsOf) }}</td>
            <td>{{ profile.openingOV - profile.usedOV }}</td>
            <td>{{ profile.openingOP - profile.usedOP }}</td>
          </tr>
        </tbody>
      </table>
    </template>
    <template v-else>
      <p>Your time off is not tracked</p>
    </template>

    <template v-if="claims.tapr && reports.length > 0">
      <h1>Your Reports</h1>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Last</th>
            <th>Vacation</th>
            <th>PPTO</th>
          </tr>
        </thead>
        <tbody>
          <!-- filter out reports that are not expected to report time -->
          <tr
            v-for="report in reports.filter(
              (r) => r.timeSheetExpected === true
            )"
            v-bind:key="report.id"
          >
            <td>
              {{ report.displayName }}
              <span v-if="report.salary !== true" class="label">hourly</span>
            </td>
            <td>{{ formatDate(report.usedAsOf) }}</td>
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
    formatDate(date: firebase.firestore.Timestamp) {
      if (date === undefined || date === null) {
        return "unknown";
      }
      return format(date.toDate(), "yyyy MMM dd");
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
