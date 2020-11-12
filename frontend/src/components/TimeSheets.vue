<template>
  <div>
    <div class="actions">
      <router-link class="navlink" v-bind:to="{ name: 'Time Sheets List' }">
        List
      </router-link>
      <router-link class="navlink" v-bind:to="{ name: 'Time Sheets Pending' }">
        Pending
      </router-link>
      <router-link class="navlink" v-bind:to="{ name: 'Time Sheets Approved' }">
        Approved
      </router-link>
      <span v-if="showTasks">{{ oneMessage }}</span>
    </div>
    <router-view />
  </div>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import { mapGetters, mapState } from "vuex";

export default {
  data() {
    return {
      collection: db.collection("TimeSheets")
    };
  },
  created() {},
  computed: {
    ...mapState(["claims","activeTasks", "showTasks"]),
    ...mapGetters(["oneMessage"]),
  }
};
</script>
