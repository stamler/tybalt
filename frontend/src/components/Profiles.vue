<template>
  <div id="container">
    <!-- The Users mgmt UI is driven by Profiles rather than the auth users. Prior to 
  performing actions the user should perform an update which will ensure the
  profiles reflect the correct claims in firebase auth. The actual changes will 
  be performed through a cloud function (multiple calls to chclaim) then an 
  update will be called again (possibly only on the updated items based on 
  update time?)-->

    <div id="taskArea">
      <div v-if="taskAreaMode === 'default'">
        <input type="textbox" placeholder="search..." v-model="search" />
        <button v-on:click="claimsToProfiles">🔄 Reload Profiles</button>
        <button v-on:click="taskAreaMode='modClaims'" >✏️ Edit Claims</button>
      </div>
      <ModClaims v-if="taskAreaMode === 'modClaims'" v-on:cancel="taskAreaMode='default'" v-on:mod-claims="modClaims"/>
    </div>

    <table>
      <tr>
        <th>
          <input type="checkbox" v-model="selectAll" v-on:click="toggleAll()">
          {{ selected.length }}/{{ processedItems.length }} 
        </th>
        <th>user</th>
        <th>email</th>
        <th>claims</th>
      </tr>
      <tr v-for="item in processedItems" v-bind:key="item.id">
        <td>
          <input type="checkbox" v-bind:value="item.id" v-model="selected">
        </td>
        <td>{{ item.displayName }}</td>
        <td>{{ item.email }}</td>
        <td>{{ item.customClaims ? Object.keys(item.customClaims).join(", ") : "" }}</td>
        <td v-if="item.onPremId">{{ item.onPremId }}</td>
        <td v-else><button>Write AzureID to User doc</button></td>
        <td><button>Revoke refresh tokens</button></td>
        <!-- There are two IDs per user and we manually link them. 
      The first is the Azure ObjectID. This is the UID in Auth users
      and also the key in Profiles. 
      The second is the userSourceAnchor for Azure sync, called
      mS-DS-ConsistencyGuid in on-prem Active Directory. It is stored
      in the Users document under the userSourceAnchor key. The above button
      attempts to match the auth user/profile user to a Users user then if it
      finds a single match it writes the Azure ObjectID to the Users doc -->
      </tr>
    </table>
  </div>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
const items = db.collection("Profiles");
import componentMaker from "./shared.js";
import ModClaims from "@/components/ModClaims.vue";

const component = componentMaker(items);
const methods = {
  modClaims(data) {
    const modClaims = firebase.functions().httpsCallable("modClaims");
    modClaims({...data, users: this.selected})
      .then((result) => {
        // TODO: get and handle real responses from callable
        console.log(JSON.stringify(result));
      })
      .catch((error) => {
        // TODO: get and handle real responses from callable
        console.log(error);
      });
  },
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

Object.assign(component.methods, methods);
component.components = { ModClaims };

export default component;
</script>

<style scoped>
#container {
  text-align: left;
}
</style>
