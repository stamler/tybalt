<template>
  <List>
    <template v-slot:taskAreaDefault>
      <button>Bundle Timesheet {{ now.isoWeek() }}</button>
    </template>
    <template v-slot:columns="{ item }">
      <td>{{ item.week }}</td>
      <td>{{ item.status }}</td>
      <td>{{ item.jobHours }}</td>
      <td>{{ item.hours }}</td>
      <td>{{ item.mealsHours }}</td>
    </template>
  </List>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import store from "../store";
import { mapState } from "vuex";
import moment from "moment";
import List from "./List";

export default {
  components: { List },
  data() {
    return {
      now: moment(),
      schema: {
        week: { display: "Week Number" },
        status: { display: "Status" },
        jobHours: { display: "Job Hours" },
        hours: { display: "Non-Job Hours" },
        mealsHours: { display: "Meal Hours" }
      },
      collection: db.collection("TimeSheets"),
      items: []
    };
  },
  computed: mapState(["claims"]),
  created() {
    // Modify UI based on permissions and business requirements here
    this.create = this.select = this.del = this.edit =
      this.claims.hasOwnProperty("users") && this.claims["users"] === true;
    this.$bind(
      "items",
      db.collection("TimeSheets").where("uid", "==", store.state.user.uid)
    ).catch(error => {
      alert(`Can't load Time Sheets: ${error.message}`);
    });
  }
};
</script>
