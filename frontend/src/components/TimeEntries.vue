<template>
  <div>
    <div id="nav">
      <router-link to="list">List</router-link>&nbsp;
      <router-link to="add">New</router-link>
    </div>
    <h2>
      Week {{ now.isoWeek() }} is
      {{ now.startOf("week").format("ddd MMM D") }} to
      {{ now.endOf("week").format("ddd MMM D") }}
    </h2>
    <router-view>
      <template v-slot:taskAreaDefault>
        <button>Check Entries</button>
      </template>
      <template v-slot:headers>
        <th>Date</th>
        <th>Project / Proposal</th>
        <th>Division</th>
        <th>Type</th>
        <th>Hours</th>
        <th>Job Hours</th>
        <th>Meals Hours</th>
        <th>Work Record</th>
        <th>Notes</th>
      </template>
      <template v-slot:columns="{ item }">
        <td>{{ item.date.toDate() | shortDate }}</td>
        <td>{{ item.project }}</td>
        <td>{{ item.division }}</td>
        <td>{{ item.timetype }}</td>
        <td>{{ item.hours }}</td>
        <td>{{ item.jobHours }}</td>
        <td>{{ item.mealsHours }}</td>
        <td>{{ item.workrecord }}</td>
        <td>{{ item.project }}</td>
        <td>{{ item.description }}</td>
        <td>{{ item.comments }}</td>
      </template>
    </router-view>
  </div>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import store from "../store";
import { mapState } from "vuex";
import moment from "moment";

export default {
  data() {
    return {
      now: moment(),
      schema: {},
      collection: db.collection("TimeEntries"),
      items: db
        .collection("TimeEntries")
        .where("uid", "==", store.state.user.uid)
        .orderBy("date", "desc")
    };
  },
  computed: mapState(["claims"]),
  filters: {
    shortDate(date) {
      return moment(date).format("MMM DD");
    }
  }
};
</script>
