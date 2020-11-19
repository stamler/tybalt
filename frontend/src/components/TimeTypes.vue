<template>
  <div>
    <div class="actions">
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
      collection: db.collection("TimeTypes"),
      items: db.collection("TimeTypes")
    };
  },
  computed: {
    ...mapState(["claims"]),
    // Determine whether to show UI controls based on claims
    hasPermission() {
      return (
        Object.prototype.hasOwnProperty.call(this.claims, "admin") &&
        this.claims["admin"]
      );
    }
  }
};
</script>
