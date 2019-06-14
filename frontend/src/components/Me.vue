<template>
  <div>
    <div id="nav">
      <router-link to="#" v-on:click.native="signOut()">Sign Out</router-link>
    </div>
    <h2>Hi, {{ user.displayName }}</h2>
    <img alt="TBTE logo" src="../assets/logo.png" />
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
