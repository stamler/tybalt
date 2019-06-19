<template>
  <div>
    <div class="nav">
      <router-link class="navlink" to="list">List</router-link>
      <router-link class="navlink" v-if="hasPermission" to="add">
        New
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
      collection: db.collection("Divisions"),
      items: db.collection("Divisions")
    };
  },
  computed: {
    ...mapState(["claims"]),
    // Determine whether to show UI controls based on claims
    hasPermission() {
      return this.claims.hasOwnProperty("admin") && this.claims["admin"];
    }
  }
};
</script>
