<template>
  <div>
    <div class="actions">
      <router-link class="navlink" v-bind:to="{ name: 'TimeSheets List' }">
        List
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
  data() {
    return {
      collection: db.collection("TimeSheets"),
      items: []
    };
  },
  created() {
    this.$bind(
      "items",
      db
        .collection("TimeSheets")
        .where("uid", "==", store.state.user.uid)
        .orderBy("weekEnding", "desc")
    ).catch(error => {
      alert(`Can't load Time Sheets: ${error.message}`);
    });
  },
  computed: {
    ...mapState(["claims"]),
    saturdays() {
      const weeks = this.items
        .filter(x => x.hasOwnProperty("weekEnding"))
        .map(x => x.weekEnding.toDate().valueOf());
      // return an array of unique primitive date values (valueOf())
      // We must extract Month/Day info in the UI
      return [...new Set(weeks)].map(x => new Date(x));
    }
  }
};
</script>
