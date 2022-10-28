<template>
  <button @click="$emit('click')" :title="title">
    <send-icon v-if="type === 'send'" />
    <x-circle-icon v-if="type === 'delete'" />
  </button>
</template>

<script lang="ts">
import Vue from "vue";
import { SendIcon, XCircleIcon } from "vue-feather-icons";

export default Vue.extend({
  props: {
    type: String,
    title: String,
  },
  components: { SendIcon, XCircleIcon },
  name: "ActionButton",
});
</script>

<style scoped>
button {
  background: none;
  border: none;
  text-decoration: none;
  cursor: pointer;
  margin: inherit;
  padding: 0;
  display: inherit;
}
button:hover {
  transition: filter 0.05s ease-in;
  filter: drop-shadow(2px 2px 1px rgb(0 0 0 / 0.3));
}

button:active {
  filter: brightness(0.7) drop-shadow(1px 1px 1px rgb(0 0 0 / 0.3));
}
</style>
