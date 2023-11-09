<template>
  <DSList v-if="itemsQuery !== null" :query="itemsQuery" :search="true">
    <template #anchor="{ start }">{{ relativeTime(start) }}</template>
    <template #headline="{ name }">{{ name }}</template>
    <template #line1="{ description }">{{ description }}</template>
    <template #line2="{ start, end }">
      {{ shortDateWithWeekday(start) }}
      to
      {{ shortDateWithWeekday(end) }}
    </template>
    <template #line3="{ availability }">{{ availability }}</template>
    <template #actions="item">
      <action-button type="delete" @click="delVacation(item)" />
    </template>
  </DSList>
</template>

<script setup lang="ts">
import DSList from "./DSList.vue";
import { ref } from "vue";
import { shortDateWithWeekday, relativeTime, del } from "./helpers";
import { subWeeks } from "date-fns";
import { useStateStore } from "../stores/state";
import ActionButton from "./ActionButton.vue";
import { firebaseApp } from "../firebase";
import {
  query,
  where,
  orderBy,
  getFirestore,
  collection,
  DocumentData,
} from "firebase/firestore";
const db = getFirestore(firebaseApp);

const store = useStateStore();

const delVacation = function (item: DocumentData) {
  del(item, collection(db, "Vacations"));
};

const itemsQuery = ref(
  query(
    collection(db, "Vacations"),
    where("uid", "==", store.user.uid),
    where("end", ">", subWeeks(new Date(), 8)),
    orderBy("end", "desc")
  )
);
</script>
