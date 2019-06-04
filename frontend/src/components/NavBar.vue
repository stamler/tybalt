<template>
  <nav id="nav">
    <span v-for="link in links" v-bind:key="link.name">
      <router-link v-bind:to="{ name: link.name }" v-if="showLink(link)">
        {{ link.name }}
      </router-link>&nbsp;
    </span>
    <span id="userBox">
      <button v-on:click="signOut()">Sign Out</button>&nbsp;
      <router-link to="/admin/profiles/userid">{{ user.displayName }}</router-link>
    </span>
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
#userBox {
  background-color: #777777;
  padding: 0px 4px 0px;
  border-radius: 3px;
}

#userBox button {
  margin:0px;
  position: relative;
  top: -1px;
}
</style>
