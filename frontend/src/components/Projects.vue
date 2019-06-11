<template>
  <div>
    <div id="nav">
      <router-link to="list">List</router-link>&nbsp;
      <router-link v-if="hasPermission" to="add">New</router-link>
    </div>
    <router-view>
      <template v-slot:columns="{ item }">
        <td>{{ item.id }}</td>
        <td>{{ item.manager }}</td>
        <td>{{ item.client }}</td>
        <td>{{ item.proposal }}</td>
        <td>{{ item.description }}</td>
        <td>{{ item.status }}</td>
      </template>
    </router-view>
  </div>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import { mapState } from "vuex";

export default {
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
  },
  computed: {
    ...mapState(["claims"]),
    // Determine whether to show UI controls based on claims
    hasPermission () {
      return this.claims.hasOwnProperty("projects") &&
        this.claims["projects"];
    }
  }
}
</script>
