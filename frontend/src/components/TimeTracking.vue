<template>
  <div>
    <div class="actions">
      <router-link class="navlink" v-bind:to="{ name: 'Time Tracking List' }">
        List
      </router-link>
      <WaitMessages v-if="showTasks" />
    </div>
    <router-view />
  </div>
</template>
<script>
import WaitMessages from "./WaitMessages";
import firebase from "@/firebase";
const db = firebase.firestore();
import { mapState } from "vuex";

export default {
  components: {
    WaitMessages
  },
  data() {
    return {
      collection: db.collection("TimeTracking"),
      timeSheets: db
        .collection("TimeSheets")
        .where("approved", "==", true)
        .where("locked", "==", false)
    };
  },
  computed: {
    ...mapState(["claims", "showTasks"])
  }
};
</script>
