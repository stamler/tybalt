<template>
  <div>
    <div class="actions">
      <router-link class="navlink" v-bind:to="{ name: 'Users' }">
        List
      </router-link>
    </div>
    <router-view />
  </div>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();

export default {
  data() {
    return {
      schema: {
        givenName: true,
        surname: true,
        created: true,
        updated: true,
        userSourceAnchor: { display: "ms-DS-ConsistencyGuid" },
        lastComputer: { display: "Last Computer" }
      },
      collection: db.collection("Users"),
      items: db.collection("Users")
    };
  }
};
</script>
