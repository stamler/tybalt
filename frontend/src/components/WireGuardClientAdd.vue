<!-- 
General Configuration steps for client

1. Admin creates a new client profile in the admin interface, specifying
   username, hostname, and IP address. This file does that.

2. User downloads the WireGuard client for their platform from
   https://www.wireguard.com/install/ 

3. User signs in and sees an option to download the client profile (zip file).
   The private key is generated at download time on the user's browser. The
   public key will be pushed to the WireGuardClients collection that was
   previously created. The user can import this profile into their WireGuard
   app.

4. The admin approves the client profile. The admin can also delete or disable
   the profile if the user is no longer authorized to use the VPN.

5. The config is downloaded periodically by the server from tybalt. Disabling
   the profile will remove it from the config on the next download.
   
-->
<template>
  <form id="editor">
    <span class="field">
      <select class="grow" name="uid" v-model="item.uid">
        <option disabled selected value="">-- choose an employee --</option>
        <option v-for="p in profiles" :value="p.id" v-bind:key="p.id">
          {{ p.displayName }}
        </option>
      </select>
    </span>
    <span class="field">
      <select class="grow" name="devices" v-model="item.device">
        <option disabled selected value="">-- choose a device --</option>
        <option v-for="d in devices" :value="d.id" v-bind:key="d.id">
          {{ d.computerName }}
        </option>
      </select>
    </span>
    <span class="field">
      <button type="button" v-on:click="create()">Create</button>
      <button type="button" v-on:click="$router.push(parentPath)">
        Cancel
      </button>
    </span>
  </form>
</template>

<script lang="ts">
import Vue from "vue";
import { useStateStore } from "../stores/state";
import firebase from "../firebase";
const db = firebase.firestore();

export default Vue.extend({
  setup() {
    const store = useStateStore();
    const { startTask, endTask } = store;
    return { startTask, endTask };
  },
  data() {
    return {
      parentPath: "",
      collectionObject: db.collection("WireGuardClients"),
      item: {} as firebase.firestore.DocumentData,
      profiles: [] as firebase.firestore.DocumentData[],
      devices: [] as firebase.firestore.DocumentData[],
    };
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.$bind("profiles", db.collection("Profiles").orderBy("displayName"));
    this.$bind("devices", db.collection("Computers").orderBy("computerName"));
  },
  methods: {
    async create() {
      this.startTask({
        id: "createClient",
        message: "creating client...",
      });

      const wgCreateKeylessClient = firebase
        .functions()
        .httpsCallable("wgCreateKeylessClient");
      return wgCreateKeylessClient({
        uid: this.item.uid,
        computerId: this.item.device,
      })
        .then(() => {
          this.endTask("createClient");
          this.$router.push(this.parentPath);
        })
        .catch((error) => {
          this.endTask("createClient");
          alert(`Error creating client: ${error.message}`);
        });
    },
    clearEditor() {
      this.item = {};
    },
  },
});
</script>
