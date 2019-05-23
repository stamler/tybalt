<template>
  <nav id="nav">
    <router-link to="/dashboard">Dashboard</router-link> |
    <router-link to="/projects">Projects</router-link> |
    <router-link to="/time">Time</router-link> |
    <router-link to="/about">About</router-link> |
    <router-link to="/admin">Admin</router-link> |

    <span v-if="state == 'ready'">
      <button v-on:click="signOut()">Sign Out</button>
      {{ message }}{{ user.displayName }}
    </span>
    <span v-else-if="state == 'loading'">Loading...</span>
    <span v-else>Unknown State</span>
  </nav>
</template>

<script>
import firebase from "@/firebase";
import { mapState } from "vuex";
import { signOut } from "@/auth";

export default {
  data: function() {
    return {
      message: "Hi, "
    };
  },
  computed: mapState({
    state: state => state.appStatus,
    user: state => state.user
  }),
  methods: {
    signOut
  }
};
</script>
<style>
#nav {
  padding: 30px;
}

#nav a {
  font-weight: bold;
  color: #2c3e50;
}

#nav a.router-link-exact-active {
  color: #42b983;
}
</style>
