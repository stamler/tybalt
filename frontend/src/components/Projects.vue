<template>
  <router-view/>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import List from './List.vue'

export default {
  components: { List },
  data() {
    return {
      schema: {
        job: {display: "Job", id: true},
        manager: {display: "Project Manager"},
        client: {display: "Client"},
        proposal: {display: "Proposal"},
        description: {display: "Description", sort:false},
        status: true // must be an object, otherwise other code fails
      },
      collection: db.collection("Projects"),
      items: db.collection("Projects"),
    }
  }
}
</script>
