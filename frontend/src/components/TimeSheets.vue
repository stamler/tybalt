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
      <WaitMessages v-if="showTasks" />
    </div>
    <router-view />
  </div>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import { mapState } from "vuex";
import WaitMessages from "./WaitMessages";

export default {
  components: {
    WaitMessages
  },
  data() {
    return {
      collection: db.collection("TimeSheets")
    };
  },
  computed: {
    ...mapState(["showTasks"])
  }
};
</script>
