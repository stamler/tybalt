<template>
  <DSList
    v-if="itemsQuery !== null"
    :query="itemsQuery"
    :search="true"
    class="lwrapper"
  >
    <template #anchor="{ created }">{{ relativeTime(created) }}</template>
    <template #headline="item">
      {{ item.givenName }} {{ item.surname }}
    </template>
    <template #line1="{ computer }">{{ computer }}</template>
  </DSList>
</template>

<script setup lang="ts">
import DSList from "./DSList.vue";
import { ref } from "vue";
import { relativeTime } from "./helpers";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit,
} from "firebase/firestore";

const itemsQuery = ref(
  query(
    collection(getFirestore(firebaseApp), "Logins"),
    orderBy("created", "desc"),
    limit(101)
  )
);
</script>
<style scoped>
.lwrapper :deep(.anchorbox) {
  flex-basis: 7.2em;
}
</style>
