<template>
  <div>
    <div id="spacer"></div>
    <div class="actions">
      <router-link to="#" v-on:click.native="signOut()">Sign Out</router-link>
    </div>
    <div id="dash">
      <h2>Hi, {{ user.displayName }}</h2>
      <img alt="TBTE logo" src="../assets/logo.png" />
    </div>
  </div>
</template>
<script lang="ts">
import { signOut } from "../main";
import { mapState } from "vuex";

export default {
  computed: mapState(["user"]),
  methods: {
    signOut
  }
};
</script>
<style>
#dash {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
#dash img,
h2 {
  align-self: center;
}
#spacer {
  background-color: rgb(255, 163, 51);
  flex: 0 0 3em;
}
</style>
