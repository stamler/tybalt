<template>
  <div>
    <!-- TODO: 
    
    Implement Entire Row as scoped slot rather than using Schema property?
    https://jsfiddle.net/pyrello/odwag9mx/

    -->
    <List :select="true && hasPermission">
      <template v-slot:taskAreaDefault="{ taskAreaMode, setTaskMode }">
        <button v-on:click="claimsToProfiles">🔄 Reload Profiles</button>
        <button v-on:click="setTaskMode('modClaims')">✏️ Edit Claims</button>
      </template>
      <template v-slot:taskAreaNonDefault="{ taskAreaMode, setTaskMode }">
        <ModClaims
          v-if="taskAreaMode === 'modClaims'"
          v-on:cancel="setTaskMode('default')"
        />
      </template>
      <template v-slot:columns="{ item }">
        <td>{{ item.displayName }}</td>
        <td>{{ item.email }}</td>
        <td>{{ item.customClaims | keysString }}</td>
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
import ModClaims from "@/components/ModClaims.vue";
import List from "@/components/List.vue";

export default {
  components: { ModClaims, List },
  data() {
    return {
      schema: {
        displayName: { display: "user" },
        email: true,
        claims: true
      },
      collection: db.collection("Profiles"),
      items: db.collection("Profiles")
    };
  },
  computed: {
    ...mapState(["claims", "user"]),
    // Determine whether to show UI controls based on claims
    hasPermission() {
      return this.claims.hasOwnProperty("profiles") && this.claims["profiles"];
    }
  },
  methods: {
    claimsToProfiles() {
      const claimsToProfiles = firebase
        .functions()
        .httpsCallable("claimsToProfiles");
      claimsToProfiles({})
        .then(result => {
          console.log(JSON.stringify(result));
        })
        .catch(error => {
          console.log(error);
        });
    }
  },
  filters: {
    keysString(obj) {
      return obj ? Object.keys(obj).join(", ") : "";
    }
  }
};
</script>
