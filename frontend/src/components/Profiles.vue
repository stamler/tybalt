<template>
  <div>
    <!-- TODO: 
    
    Implement Entire Row as scoped slot rather than using Schema property?
    https://jsfiddle.net/pyrello/odwag9mx/

    -->
    <List :select="true && hasPermission">
      <template v-slot:taskAreaDefault="{ taskAreaMode, setTaskMode }">
        <button v-on:click="claimsToProfiles">🔄 Reload Profiles</button>
        <button v-on:click="setTaskMode('modClaims')" >✏️ Edit Claims</button>
      </template>
      <template v-slot:taskAreaNonDefault="{ taskAreaMode, setTaskMode }">
        <ModClaims v-if="taskAreaMode === 'modClaims'" v-on:cancel="setTaskMode('default')" />
      </template>
      <template v-slot:lastCol="{ item }">
        <button>Write AzureID to User doc</button>
        <button>Revoke refresh tokens</button>
      </template>
    </List>
  </div>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import { mapState } from "vuex";
import moment from "moment";
import ModClaims from "@/components/ModClaims.vue";
import List from "@/components/List.vue";

export default {
  components: { ModClaims, List },
  data() {
    return {
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
  computed: {
    ...mapState(["claims", "user"]),
    // Determine whether to show UI controls based on claims
    hasPermission () {
      return this.claims.hasOwnProperty("profiles") &&
        this.claims["profiles"];
    }
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
