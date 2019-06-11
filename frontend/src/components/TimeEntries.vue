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
      <template v-slot:columns="{ item }">
        <td>{{ item.date.toDate() | shortDate }}</td>
        <td>{{ item.job }}</td>
        <td>{{ item.division }}</td>
        <td>{{ item.timetype }}</td>
        <td>{{ item.hours }}</td>
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
      schema: {
        date: { display: "Date" },
        job: { display: "Job/Proposal" },
        division: { display: "Division" },
        timetype: { display: "Type" },
        hours: { display: "Hours" },
        workrecord: { display: "Work Record" },
        project: { display: "Project" },
        description: { display: "Description" },
        comments: { display: "Comments" }
      },
      collection: db.collection("TimeEntries"),
      items: db
        .collection("TimeEntries")
        .where("uid", "==", store.state.user.uid)
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
