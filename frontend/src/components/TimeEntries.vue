<template>
  <div>
    <div class="actions">
      <router-link class="navlink" to="list">List</router-link>
      <router-link class="navlink" to="add">New</router-link>
      <router-link class="navlink" to="#">Check</router-link>
      <router-link
        class="navlink"
        v-bind:to="{ name: 'Time Sheets' }"
        v-on:click.native="bundle(now.year(), now.isoWeek())"
      >
        Bundle W{{ now.isoWeek() }} ({{ now.startOf("week").format("D") }}-{{
          now.endOf("week").format("D")
        }})
      </router-link>
    </div>
    <router-view />
  </div>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import store from "../store";
import { mapState } from "vuex";
import moment from "moment";

export default {
  methods: {
    bundle(year, week) {
      const bundleTimesheet = firebase
        .functions()
        .httpsCallable("bundleTimesheet");
      return bundleTimesheet({ year, week })
        .then(res => {
          console.log(
            `bundled ${res.data.year}-${res.data.week} for ${res.data.uid}`
          );
        })
        .catch(error => {
          alert(`Error bundling timesheet: ${error.message}`);
        });
    }
  },
  data() {
    return {
      now: moment(),
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
