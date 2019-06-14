<template>
  <div>
    <div class="nav">
      <router-link to="#" v-on:click.native="signOut()">Sign Out</router-link>
    </div>
    <div id="dash">
      <h2>Hi, {{ user.displayName }}</h2>
      <img alt="TBTE logo" src="../assets/logo.png" />
    </div>
  </div>
</template>
<script>
import { signOut } from "@/main";
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
</style>
