<template>
  <div class="header">
    <div class="linksstart">
      <action-button color="00f" @click="toggleMenu">&#9776;</action-button>
    </div>
    <div class="linksend">
      <router-link to="/me">{{ user.displayName }}</router-link>
      <a
        href="https://github.com/tbt-eng/docs/blob/master/tybalt.md"
        target="_blank"
        >Help</a
      >
    </div>
  </div>
</template>

<script lang="ts">
import { useStateStore } from "../stores/state";
import ActionButton from "./ActionButton.vue";

export default {
  components: { ActionButton },
  setup: () => {
    const store = useStateStore();
    // reactivity of user is not needed here so we can just return the value
    return { user: store.user, toggleMenu: store.toggleMenu };
  },
};
</script>
