<template>
  <div>
    <div id="nav">
      <router-link to="list">List</router-link>&nbsp;
      <router-link v-if="create" to="add">New</router-link>
    </div>
    <h2>Week {{ now.isoWeek() }} is 
      {{ now.startOf('week').format("ddd MMM D") }} to 
      {{ now.endOf('week').format("ddd MMM D") }}</h2>
    <router-view>
      <template v-slot:taskAreaDefault>
        <button>Check Entries</button>
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
import List from "./List";

export default {
  components: { List },
  data() {
    return {
      create: false,
      select: false,
      edit: false,
      del: false,
      now: moment(),
      schema: {
        date: {
          display: "Date",
          derivation: obj => moment(obj.date.toDate()).format("MMM DD")
        },
        job: {display: "Job/Proposal"},
        division: {display: "Division"},
        timetype: {display: "Type"},
        hours: {display: "Hours"},
        workrecord: {display: "Work Record"},
        project: {display: "Project"},
        description: {display: "Description"},
        comments: {display: "Comments"},
      },
      collection: db.collection("TimeEntries"),
      items: db.collection("TimeEntries").where("uid", "==", store.state.user.uid),
    }
  },
  computed: mapState(["claims"]),
  created() {
    // Modify UI based on permissions and business requirements here
    this.create = this.select = this.del = this.edit =
      this.claims.hasOwnProperty("time") &&
      this.claims["time"] === true
  }
}
</script>
