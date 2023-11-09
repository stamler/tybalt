<template>
  <DSList v-if="itemsQuery !== null" :query="itemsQuery" :search="true">
    <template #anchor="{ id }">{{ id }}</template>
    <template #headline="{ computerName }">{{ computerName }}</template>
    <template #line1="{ displayName }">{{ displayName }}</template>
    <template #line2="item">
      <span v-if="item.PublicKey === undefined" class="attention">
        Missing Public Key
      </span>
      <span v-else>{{ item.PublicKey }}</span>
    </template>
    <template #line3="{ enabled }">
      <span class="label" v-if="enabled === false">disabled</span>
    </template>
    <template #actions="item">
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
    </template>
  </DSList>
</template>

<script setup lang="ts">
import DSList from "./DSList.vue";
import { ref } from "vue";
import { firebaseApp } from "../firebase";
import { getFirestore, DocumentData, collection } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import ActionButton from "./ActionButton.vue";
import { useStateStore } from "../stores/state";
const functions = getFunctions(firebaseApp);

const store = useStateStore();
const { startTask, endTask } = store;

const itemsQuery = ref(
  collection(getFirestore(firebaseApp), "WireGuardClients")
);

const deleteClient = function (item: DocumentData) {
  startTask({
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
        endTask(`delete${item.id}`);
      })
      .catch((error) => {
        endTask(`delete${item.id}`);
        alert(`Error deleting client: ${error.message}`);
      });
  }
};

const toggle = function (item: DocumentData) {
  const toggle = httpsCallable(functions, "wgToggleEnableClient");
  startTask({
    id: `toggle${item.id}`,
    message: "changing enable status...",
  });
  return toggle({ id: item.id })
    .then(() => {
      endTask(`toggle${item.id}`);
    })
    .catch((error) => {
      endTask(`toggle${item.id}`);
      alert(`Error toggling status: ${error.message}`);
    });
};

const clearKey = function (item: DocumentData) {
  const clearKey = httpsCallable(functions, "wgClearPublicKey");
  startTask({
    id: `clearKey${item.id}`,
    message: "clearing public key...",
  });
  return clearKey({ id: item.id })
    .then(() => {
      endTask(`clearKey${item.id}`);
    })
    .catch((error) => {
      endTask(`clearKey${item.id}`);
      alert(`Error clearing public key: ${error.message}`);
    });
};
</script>
