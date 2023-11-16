<!-- This vue component renders the list of previous AI Chats based on title and
last_updated. Clicking on a chat will open the chat in the AIChat component. An
AIChat is a firestore document that contains a uid, title, last_updated, and an
subcollection of messages. The messages are in the ChatML format. The List is
rendered using the DSList component.
-->
<template>
  <DSList v-if="itemsQuery !== null" :query="itemsQuery" :search="true">
    <template #anchor="{ last_updated }">
      {{ shortDate(last_updated.toDate()) }}
    </template>
    <template #line1="{ title }">{{ title }}</template>
    <template #line2="{ count }">{{ count }}</template>
    <template #actions="item">
      <action-button
        v-if="!(`deleteChat${item.id}` in store.activeTasks)"
        type="delete"
        @click="delChat(item)"
      />
      <router-link :to="[parentPath, item.id, 'chat'].join('/')">
        <Icon icon="feather:chevron-right" width="24px" />
      </router-link>
    </template>
  </DSList>
</template>

<script setup lang="ts">
import DSList from "./DSList.vue";
import { ref } from "vue";
import { useRoute } from "vue-router";
import { Icon } from "@iconify/vue";
import ActionButton from "./ActionButton.vue";
import { useStateStore } from "../stores/state";
import { firebaseApp } from "../firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  collection,
  getFirestore,
  DocumentData,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { shortDate } from "./helpers";

const route = useRoute();
const parentPath = ref(route?.matched[route.matched.length - 2]?.path ?? "");
const store = useStateStore();
const { startTask, endTask } = store;

const itemsQuery = ref(
  query(
    collection(getFirestore(firebaseApp), "AIChats"),
    where("uid", "==", store.user.uid),
    orderBy("last_updated", "desc"),
  )
);

const delChat = async function (item: DocumentData) {
  // implement delete chat functionality by calling the deleteChat
  // HttpsCallable function in the backend from ai.ts
  const deleteChat = httpsCallable(getFunctions(firebaseApp), "deleteChat");
  startTask({
    id: `deleteChat${item.id}`,
    message: "deleting...",
  });
  try {
    await deleteChat({ id: item.id });
    endTask(`deleteChat${item.id}`);
  } catch (error: unknown) {
    endTask(`deleteChat${item.id}`);
    if (error instanceof Error) {
      alert(`Error deleting chat: ${error.message}`);
    } else alert(`Error deleting chat: ${JSON.stringify(error)}`);
  }
};
</script>
