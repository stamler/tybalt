<template>
  <DSList v-if="itemsQuery !== null" :query="itemsQuery" :search="true">
    <template #anchor="{ id }">{{ id }}</template>
    <template #headline="{ name }">{{ name }}</template>
    <template #line1="{ description }">{{ description }}</template>
    <template #actions="{ id }">
      <router-link :to="[parentPath, id, 'edit'].join('/')">
        <Icon icon="feather:edit" width="24px" />
      </router-link>
    </template>
  </DSList>
</template>

<script setup lang="ts">
import DSList from "./DSList.vue";
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import { Icon } from "@iconify/vue";
import { firebaseApp } from "../firebase";
import { getFirestore, collection, Query } from "firebase/firestore";
const itemsQuery = ref(null as Query | null);
const route = useRoute();
const props = defineProps({
  collectionName: {
    type: String,
    required: true,
  },
});

const parentPath = ref("");
// https://stackoverflow.com/questions/59125857/how-to-watch-props-change-with-vue-composition-api-vue-3?rq=3
watch(
  () => props.collectionName,
  (collectionName) => {
    parentPath.value = route?.matched[route.matched.length - 2]?.path ?? "";
    itemsQuery.value = collection(getFirestore(firebaseApp), collectionName);
  },
  { immediate: true }
);
</script>
