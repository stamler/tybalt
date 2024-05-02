<template>
  <div class="header">
    <div class="linksstart">
      <action-button color="00f" @click="store.toggleMenu">&#9776;</action-button>
    </div>
    <div class="linksend">
      <router-link to="/me">{{ user.displayName }}</router-link>
      <a :href="APP_DOC_URL" target="_blank">Help</a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { APP_DOC_URL } from "../config";
import { useStateStore } from "../stores/state";
import { storeToRefs } from "pinia";
import ActionButton from "./ActionButton.vue";

const store = useStateStore();
const { user } = storeToRefs(store);
</script>
