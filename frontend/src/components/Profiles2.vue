<template>
  <div>
    <div id="nav">
      <router-link to="list">List</router-link>&nbsp;
      <router-link v-if="create" to="add">New</router-link>
    </div>
    <router-view>
      <template v-slot:taskAreaDefault="{ taskAreaMode, setTaskMode }">
        <button v-on:click="claimsToProfiles">🔄 Reload Profiles</button>
        <button v-on:click="setTaskMode('modClaims')" >✏️ Edit Claims</button>
      </template>
      <template v-slot:taskAreaNonDefault="{ taskAreaMode, setTaskMode }">
        <ModClaims v-if="taskAreaMode === 'modClaims'" v-on:cancel="setTaskMode('default')" />
      </template>
    </router-view>
  </div>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import { mapState } from "vuex";
import moment from "moment";
import ModClaims from "@/components/ModClaims.vue";

export default {
  components: { ModClaims },
  data() {
    return {
      create: false,
      select: false,
      edit: false,
      del: false,
      schema: {
        displayName: {display:"user"},
        email: true,
        claims: {
          derivation: obj => obj.customClaims ? Object.keys(obj.customClaims).join(", ") : ""
        },
      },
      collection: db.collection("Profiles"),
      items: db.collection("Profiles"),
    }
  },
  computed: mapState(["claims"]),
  created() {
    // Modify UI based on permissions and business requirements here
    this.select =
      this.claims.hasOwnProperty("profiles") &&
      this.claims["profiles"] === true
  },
  methods: {
    claimsToProfiles() {
      const claimsToProfiles = firebase.functions().httpsCallable("claimsToProfiles");
      claimsToProfiles({})
        .then((result) => {
          console.log(JSON.stringify(result));
        })
        .catch((error) => {
          console.log(error);
        });
    }
  }
}
</script>
