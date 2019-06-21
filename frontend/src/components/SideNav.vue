<template>
  <div id="sidenav">
    <span class="linksstart">
      <router-link
        class="link"
        v-for="link in links"
        v-bind:key="link.name"
        v-bind:to="{ name: link.name }"
      >
        {{ link.name }}
      </router-link>
    </span>
    <span class="linksend">
      <router-link to="/me">{{ user.displayName }}</router-link>
    </span>
  </div>
</template>

<script>
import { mapState } from "vuex";

export default {
  computed: {
    ...mapState(["user", "claims"]),
    // top level router entries that have a name property and are allowed
    links() {
      return this.$router.options.routes.filter(x => {
        if (x.name) {
          if (x.meta && x.meta.claims) {
            // get intersect of link.claims & this.claims
            const intersect = x.meta.claims.filter(y =>
              this.claims.hasOwnProperty(y)
            );
            // ensure the value of at least one item is true
            return intersect.some(y => this.claims[y] === true);
          } else {
            return true;
          }
        } else {
          return false;
        }
      });
    }
  }
};
</script>
