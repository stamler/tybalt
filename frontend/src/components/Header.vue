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
import { mapState } from "vuex";
import store from "../store";
import ActionButton from "./ActionButton.vue";

export default {
  components: { ActionButton },
  methods: {
    toggleMenu(): void {
      store.commit("toggleMenu");
    },
  },
  computed: {
    ...mapState(["user"]),
  },
};
</script>
