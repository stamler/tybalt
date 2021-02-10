<template>
  <div class="header">
    <div class="linksstart">
      <router-link to="#" v-on:click.native="toggleMenu"> &#9776; </router-link>
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

export default {
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
