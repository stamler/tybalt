<template>
  <div>
    <div class="actions">
      <router-link class="navlink" v-bind:to="{ name: 'Time Exports List' }">
        List
      </router-link>
    </div>
    <router-view />
  </div>
</template>
<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import { mapState } from "vuex";

export default {
  data() {
    return {
      collection: db.collection("TimeExports"),
      timeSheets: db.collection("TimeSheets").where("approved", "==", true).where("locked", "==", false),
    };
  },
  computed: {
    ...mapState(["claims"])
  }  
}
</script>