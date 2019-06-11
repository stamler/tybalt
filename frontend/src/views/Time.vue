<template>
  <div>
    <div id="nav">
      <span v-for="link in links" v-bind:key="link.name">
        <router-link v-bind:to="{ name: link.name }" v-if="showLink(link)">
          {{ link.name }}
        </router-link>
        &nbsp;
      </span>
    </div>
    <router-view />
  </div>
</template>

<script>
import { mapState } from "vuex";

export default {
  data: function() {
    return {
      links: this.$router.options.routes.filter(x => x.name === "Time")[0]
        .children
    };
  },
  computed: {
    ...mapState(["claims", "user"])
  },
  methods: {
    showLink(link) {
      if (link.meta && link.meta.claims) {
        // get intersect of link.claims & this.claims
        const intrsect = link.meta.claims.filter(x =>
          this.claims.hasOwnProperty(x)
        );

        // ensure the value of at least one item is true
        return intrsect.some(x => this.claims[x] === true);
      } else {
        return true;
      }
    }
  }
};
</script>
