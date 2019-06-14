<template>
  <div>
    <div class="nav">
      <router-link to="#" v-on:click.native="signOut()">Sign Out</router-link>
    </div>
    <div id="dash">
      <div>
        <h2>Hi, {{ user.displayName }}</h2>
        <img alt="TBTE logo" src="../assets/logo.png" />
      </div>
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
  justify-content: center;
}
</style>
