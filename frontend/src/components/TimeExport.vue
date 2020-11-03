<template>
  <div>
    <h1>Time Export</h1>
    Weeks
  </div>
</template>
<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import { mapState } from "vuex";

export default {
  data() {
    return {
      timeSheets: db.collection("TimeSheets").where("approved", "==", true).where("locked", "==", false),
      timeExports: db.collection("TimeExports")
    };
  },
  computed: {
    ...mapState(["claims"])
  }  
}
</script>