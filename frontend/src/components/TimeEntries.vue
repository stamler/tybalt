<template>
  <div>
    <div class="actions">
      <router-link class="navlink" to="list">List</router-link>
      <router-link class="navlink" to="add">New</router-link>
      <router-link
        v-for="week in saturdays"
        v-bind:key="week.valueOf()"
        class="navlink"
        v-bind:to="{ name: 'Time Sheets' }"
        v-on:click.native="bundle(week)"
      >
        {{ week.getMonth() + 1 }}/{{ week.getDate() }}
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

export default {
  methods: {
    bundle(week) {
      const bundleTimesheet = firebase
        .functions()
        .httpsCallable("bundleTimesheet");
      return bundleTimesheet({ week_ending: week.getTime() })
        .then(() => {
          alert(
            `Timesheet created for the week ending ${week.getMonth() +
              1}/${week.getDate()}`
          );
        })
        .catch(error => {
          alert(`Error bundling timesheet: ${error.message}`);
        });
    }
  },
  data() {
    return {
      collection: db.collection("TimeEntries"),
      items: []
    };
  },
  created() {
    this.$bind(
      "items",
      db
        .collection("TimeEntries")
        .where("uid", "==", store.state.user.uid)
        .orderBy("date", "desc")
    ).catch(error => {
      alert(`Can't load Time Entries: ${error.message}`);
    });
  },
  computed: {
    ...mapState(["claims"]),
    saturdays() {
      const weeks = this.items
        .filter(x => x.hasOwnProperty("week_ending"))
        .map(x => x.week_ending.toDate().valueOf());
      // return an array of unique primitive date values (valueOf())
      // We must extract Month/Day info in the UI
      return [...new Set(weeks)].map(x => new Date(x));
    }
  }
};
</script>
