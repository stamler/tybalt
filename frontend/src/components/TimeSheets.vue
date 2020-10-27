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
import { mapState } from "vuex";

export default {
  data() {
    return {
      collection: db.collection("TimeSheets")
    };
  },
  created() {},
  computed: {
    ...mapState(["claims"])
  }
};
</script>
