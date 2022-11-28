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
import { defineComponent } from "vue";
import { searchString } from "./helpers";
import { firebaseApp } from "../firebase";
import { useCollection } from "vuefire";
import { getFirestore, DocumentData, collection } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import ActionButton from "./ActionButton.vue";
import { useStateStore } from "../stores/state";
const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp);

export default defineComponent({
  setup() {
    const store = useStateStore();
    const { startTask, endTask } = store;
    return { startTask, endTask };
  },
  components: { ActionButton },
  computed: {
    processedItems(): DocumentData[] {
      return this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .filter(
          (p: DocumentData) =>
            searchString(p).indexOf(this.search.toLowerCase()) >= 0
        );
    },
  },
  data() {
    return {
      search: "",
      parentPath: "",
      items: useCollection(collection(db, "WireGuardClients")),
    };
  },
  methods: {
    deleteClient(item: DocumentData) {
      this.startTask({
        id: `delete${item.id}`,
        message: "deleting client...",
      });
      const delClient = httpsCallable(functions, "wgDeleteClient");
      if (
        confirm(
          "This is immediate and permanent, but the peer will be unable to connect after the next time the server requests a peer list. Do you want to proceed?"
        )
      ) {
        return delClient({ id: item.id })
          .then(() => {
            this.endTask(`delete${item.id}`);
          })
          .catch((error) => {
            this.endTask(`delete${item.id}`);
            alert(`Error deleting client: ${error.message}`);
          });
      }
    },
    toggle(item: DocumentData) {
      const toggle = httpsCallable(functions, "wgToggleEnableClient");
      this.startTask({
        id: `toggle${item.id}`,
        message: "changing enable status...",
      });
      return toggle({ id: item.id })
        .then(() => {
          this.endTask(`toggle${item.id}`);
        })
        .catch((error) => {
          this.endTask(`toggle${item.id}`);
          alert(`Error toggling status: ${error.message}`);
        });
    },
    clearKey(item: DocumentData) {
      const clearKey = httpsCallable(functions, "wgClearPublicKey");
      this.startTask({
        id: `clearKey${item.id}`,
        message: "clearing public key...",
      });
      return clearKey({ id: item.id })
        .then(() => {
          this.endTask(`clearKey${item.id}`);
        })
        .catch((error) => {
          this.endTask(`clearKey${item.id}`);
          alert(`Error clearing public key: ${error.message}`);
        });
    },
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
  },
});
</script>
