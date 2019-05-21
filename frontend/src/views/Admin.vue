<template>
  <div>
    <h1>Administration</h1>
    <div id="nav">
      <span v-for="link in links" v-bind:key="link.id">
        | <router-link v-bind:to="link.path" v-if="showLink(link)">
          {{ link.text }}
        </router-link>
      </span>
    </div>
    <router-view/>
  </div>
</template>
<script>
import { mapState } from "vuex";

export default {
  data: function() {
    return {
      links: [
        { path: "/admin/rawlogins", text: "Raw Logins", claims: ["audit", "rawlogins"] },
        { path: "/admin/logins", text: "Logins" },
        { path: "/admin/profiles", text: "Profiles" },
        { path: "/admin/computers", text: "Computers", claims: ["audit", "computers"] },
        { path: "/admin/users", text: "Users" }
      ]
    }
  },
  computed: mapState({
    claims: state => state.claims
  }),
  methods: {
    showLink (link) {
      if (link.claims) {
        // get intersect of link.claims & this.claims
        const intrsect = link.claims.filter(x => this.claims.hasOwnProperty(x));

        // ensure the value of at least one item is true
        return intrsect.some(x => this.claims[x] === true);
      } else {
        return true;
      }
    }
  }
}
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
