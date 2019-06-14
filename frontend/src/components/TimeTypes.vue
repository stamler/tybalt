<template>
  <div>
    <div class="nav">
      <router-link class="navlink" to="list">List</router-link>
      <router-link class="navlink" v-if="hasPermission" to="add">
        New
      </router-link>
    </div>
    <router-view>
      <template v-slot:headers="{ sort }">
        <th>Code</th>
        <th>Name</th>
        <th>Description</th>
      </template>
      <template v-slot:columns="{ item }">
        <td>{{ item.id }}</td>
        <td>{{ item.name }}</td>
        <td>{{ item.description }}</td>
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
        code: { id: true },
        name: true,
        description: true
      },
      collection: db.collection("TimeTypes"),
      items: db.collection("TimeTypes")
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
