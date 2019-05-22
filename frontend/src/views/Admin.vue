<template>
  <div>
    <h1>Administration</h1>
    <div id="nav">
      <span v-for="link in links" v-bind:key="link.id">
        | <router-link v-bind:to="{ name: link.name }" v-if="showLink(link)">
          {{ link.name }}
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
      links: this.$router.options.routes.filter(x => x.name === "Admin")[0].children
    }
  },
  computed: mapState({
    claims: state => state.claims
  }),
  methods: {
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
