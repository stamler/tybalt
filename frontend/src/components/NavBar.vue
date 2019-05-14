<template>
  <nav id="nav">
    <router-link to="/dashboard">Dashboard</router-link> |
    <router-link to="/about">About</router-link> |
    <router-link to="/admin">Admin</router-link> |

    <span v-if="state == 'ready'">
      <input
        id="signOutButtonIncomplete"
        type="button"
        value="Sign Out firebase only"
        v-on:click="signOut(false)"
      />
      <input
        id="signOutButton"
        type="button"
        value="Sign Out"
        v-on:click="signOut()"
      />
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
