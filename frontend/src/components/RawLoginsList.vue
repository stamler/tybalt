<template>
  <DSList
    v-if="itemsQuery !== null"
    :query="itemsQuery"
    :search="true"
    class="lwrapper"
  >
    <template #anchor="{ created }">{{ relativeTime(created) }}</template>
    <template #headline="item"> {{ item.mfg }} {{ item.model }} </template>
    <template #byline="item">
      <span v-if="item.serial">
        <router-link
          v-bind:to="{
            name: 'Computer Details',
            params: { id: makeSlug(item) },
          }"
        >
          {{ item.serial }}
        </router-link>
      </span>
    </template>
    <template #line1="item">
      {{ item.upn }} {{ item.userSourceAnchor }}
    </template>
    <template #line2="item">
      <span
        v-if="Object.keys(item.networkConfig)[0] === undefined"
        class="attention"
      >
        Hostname Not Available
      </span>
      <span v-else>
        {{ item.networkConfig[Object.keys(item.networkConfig)[0]].dnsHostname }}
      </span>
      reported from radiator v{{ item.radiatorVersion }}
    </template>
    <template #line3="item">
      <span v-if="!item.userSourceAnchor">missing userSourceAnchor</span>
      <span v-if="!item.serial"> missing serial {{ guessSerial(item) }} </span>
      <span v-if="isNaN(item.radiatorVersion)"> missing radiatorVersion </span>
    </template>
    <template #actions="item">
      <action-button type="delete" @click="del(item, collectionObject)" />
    </template>
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
  DocumentData,
  query,
  orderBy,
} from "firebase/firestore";
import ActionButton from "./ActionButton.vue";
import { del } from "./helpers";

const collectionObject = collection(getFirestore(firebaseApp), "RawLogins");
const itemsQuery = ref(query(collectionObject, orderBy("created", "desc")));

const guessSerial = function (item: DocumentData): string {
  const dnsHostname =
    item.networkConfig[Object.keys(item.networkConfig)[0]].dnsHostname;
  try {
    return dnsHostname.split("-")[1] || "";
  } catch (error) {
    return "";
  }
};
const makeSlug = function (item: DocumentData): string {
  const serial = item.serial;
  const mfg = item.mfg;
  const sc = serial.replace(/\s|\/|,/g, "");
  const mc = mfg
    .toLowerCase()
    .replace(/\/|\.|,|inc|ltd/gi, "")
    .trim()
    .replace(/ /g, "_");
  if (sc.length >= 4 && mc.length >= 2) {
    return sc + "," + mc;
  } else {
    throw new Error(`serial ${sc} or manufacturer ${mc} too short`);
  }
};
</script>
<style scoped>
.lwrapper :deep(.anchorbox) {
  flex-basis: 7.2em;
}
</style>
