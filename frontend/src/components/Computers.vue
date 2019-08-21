<template>
  <div>
    <div class="actions">
      <router-link class="navlink" v-bind:to="{ name: 'Computers' }">
        List
      </router-link>
      <router-link class="navlink" v-bind:to="{ name: 'Retired Computers' }">
        Retired
      </router-link>
    </div>
    <router-view />
  </div>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import { mapState } from "vuex";
import moment from "moment";

export default {
  data() {
    return {
      schema: {
        computerName: { display: "Computer" },
        osVersion: { display: "Windows" },
        mfg: true,
        model: true,
        userGivenName: { display: "First" },
        userSurname: { display: "Last" },
        assigned: { sort: false },
        updated: true,
        created: true
      },
      collection: db.collection("Computers"),
      items: db.collection("Computers")
    };
  },
  computed: {
    ...mapState(["claims"]),
    // Determine whether to show UI controls based on claims
    hasPermission() {
      return (
        this.claims.hasOwnProperty("computers") && this.claims["computers"]
      );
    }
  },
  filters: {
    dateFormat(date) {
      return moment(date).format("YYYY MMM DD / HH:mm:ss");
    },
    relativeTime(date) {
      return moment(date).fromNow();
    }
  }
};
</script>
