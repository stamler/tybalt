<template>
  <nav id="nav">
    <span v-for="link in links" v-bind:key="link.name">
      | <router-link v-bind:to="{ name: link.name }" v-if="showLink(link)">
        {{ link.name }}
      </router-link>
    </span>
    <span v-if="state == 'ready'">
      <button v-on:click="signOut()">Sign Out</button>
      <span>{{ user.displayName }}</span>
    </span>
    <span v-else-if="state == 'loading'">Loading...</span>
    <span v-else>Unknown State</span>
  </nav>
</template>

<script>
import firebase from "@/firebase";
import { mapState } from "vuex";
import { signOut } from "@/main";

export default {
  data: function() {
    return {
      // top level router entries that have a name property
      links: this.$router.options.routes.filter(x => x.name)
    };
  },
  computed: mapState({
    state: state => state.appStatus,
    user: state => state.user
  }),
  methods: {
    signOut,
    showLink (link) {
      if (link.meta && link.meta.claims) {
        // get intersect of link.claims & this.claims
        const intrsect = link.meta.claims.filter(x => this.claims.hasOwnProperty(x));

        // ensure the value of at least one item is true
        return intrsect.some(x => this.claims[x] === true);
      } else {
        return true;
      }
    }
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
