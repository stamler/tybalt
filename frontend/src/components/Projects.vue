<template>
  <div>
    Editing {{ enableEditing ? "Enabled" : "Disabled" }}
    <div id="nav">
      <router-link to="list">List</router-link>&nbsp;
      <router-link to="add">New</router-link>
    </div>
    <router-view/>
  </div>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();

export default {
  props: ["enableEditing"],
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
