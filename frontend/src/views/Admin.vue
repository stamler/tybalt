<template>
  <div>
    <div class="nav">
      <span class="linksstart">
        <router-link to="#" v-on:click.native="toggleMenu">
          &#9776;
        </router-link>
        <router-link
          class="link"
          v-for="link in links"
          v-bind:key="link.name"
          v-bind:to="{ name: link.name }"
          v-if="showLink(link)"
        >
          {{ link.name }}
        </router-link>
      </span>
    </div>
    <router-view id="content" />
  </div>
</template>
<script>
import { mapState } from "vuex";
import store from "../store";

export default {
  data: function() {
    return {
      links: this.$router.options.routes.filter(x => x.name === "Admin")[0]
        .children
    };
  },
  computed: mapState(["claims"]),
  methods: {
    toggleMenu() {
      store.commit("toggleMenu");
    },
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
