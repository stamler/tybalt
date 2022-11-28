<template>
  <div id="list">
    <div id="listbar">
      <input
        id="searchbox"
        type="textbox"
        placeholder="search..."
        v-model="search"
      />
      <span>{{ processedItems.length }} items</span>
    </div>
    <div class="listentry" v-for="item in processedItems" v-bind:key="item.id">
      <div class="anchorbox">{{ item.id }}</div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">{{ item.computerName }}</div>
        </div>
        <div class="firstline">{{ item.displayName }}</div>
        <div class="secondline">
          <span v-if="item.PublicKey === undefined" class="attention">
            Missing Public Key
          </span>
          <span v-else>{{ item.PublicKey }}</span>
        </div>
        <div class="thirdline">
          <span class="label" v-if="item.enabled === false">disabled</span>
        </div>
      </div>
      <div class="rowactionsbox">
        <!-- Enable/Disable Toggle Switch -->
        <action-button @click="toggle(item)">
          <span v-if="item.enabled">Disable</span>
          <!-- <span v-else-if="item.PublicKey">Enable</span> -->
          <span v-else>Enable</span>
        </action-button>
        <action-button
          v-if="item.PublicKey"
          type="key"
          :title="'reset keys'"
          @click="clearKey(item)"
        />
        <action-button type="delete" @click="deleteClient(item)" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from "vue";
import { searchString } from "./helpers";
import { mapState } from "vuex";
import firebase from "../firebase";
import ActionButton from "./ActionButton.vue";
import store from "../store";
const db = firebase.firestore();

export default Vue.extend({
  components: { ActionButton },
  computed: {
    ...mapState(["claims"]),
    processedItems(): firebase.firestore.DocumentData[] {
      return this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .filter(
          (p: firebase.firestore.DocumentData) =>
            searchString(p).indexOf(this.search.toLowerCase()) >= 0
        );
    },
  },
  data() {
    return {
      search: "",
      parentPath: "",
      collectionObject: db.collection("WireGuardClients"),
      items: [] as firebase.firestore.DocumentData[],
    };
  },
  methods: {
    deleteClient(item: firebase.firestore.DocumentData) {
      store.commit("startTask", {
        id: `delete${item.id}`,
        message: "deleting client...",
      });
      const delClient = firebase.functions().httpsCallable("wgDeleteClient");
      if (
        confirm(
          "This is immediate and permanent, but the peer will be unable to connect after the next time the server requests a peer list. Do you want to proceed?"
        )
      ) {
        return delClient({ id: item.id })
          .then(() => {
            store.commit("endTask", { id: `delete${item.id}` });
          })
          .catch((error) => {
            store.commit("endTask", { id: `delete${item.id}` });
            alert(`Error deleting client: ${error.message}`);
          });
      }
    },
    toggle(item: firebase.firestore.DocumentData) {
      const toggle = firebase.functions().httpsCallable("wgToggleEnableClient");
      store.commit("startTask", {
        id: `toggle${item.id}`,
        message: "changing enable status...",
      });
      return toggle({ id: item.id })
        .then(() => {
          store.commit("endTask", { id: `toggle${item.id}` });
        })
        .catch((error) => {
          store.commit("endTask", { id: `toggle${item.id}` });
          alert(`Error toggling status: ${error.message}`);
        });
    },
    clearKey(item: firebase.firestore.DocumentData) {
      const clearKey = firebase.functions().httpsCallable("wgClearPublicKey");
      store.commit("startTask", {
        id: `clearKey${item.id}`,
        message: "clearing public key...",
      });
      return clearKey({ id: item.id })
        .then(() => {
          store.commit("endTask", { id: `clearKey${item.id}` });
        })
        .catch((error) => {
          store.commit("endTask", { id: `clearKey${item.id}` });
          alert(`Error clearing public key: ${error.message}`);
        });
    },
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.$bind("items", this.collectionObject);
  },
});
</script>
