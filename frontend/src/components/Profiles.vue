<template>
  <div>
    <List />
  </div>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import { mapState } from "vuex";
import List from "@/components/ProfilesList.vue";

export default {
  components: { List },
  data() {
    return {
      collection: db.collection("Profiles"),
      items: db.collection("Profiles")
    };
  },
  computed: {
    ...mapState(["claims", "user"])
  }
};
</script>
