<template>
  <div>
    <div class="actions">
      <router-link
        v-for="route in siblingRoutes"
        v-bind:key="route.name"
        class="navlink"
        v-bind:to="{ name: route.name }"
      >
        {{ route | uiLinkTitle }}
      </router-link>
      <WaitMessages v-if="showTasks" />
    </div>
    <router-view />
  </div>
</template>

<script lang="ts">
import { RouteConfig } from "vue-router";
import mixins from "./mixins";
import WaitMessages from "./WaitMessages.vue";
import { mapState } from "vuex";
export default mixins.extend({
  filters: {
    uiLinkTitle(item: RouteConfig): string {
      return item.meta?.uiName ?? item.name;
    }
  },
  components: { WaitMessages },
  computed: {
    ...mapState(["claims", "showTasks"]),
    siblingRoutes(): RouteConfig[] | null {
      const parentPath = this?.$route?.matched[this.$route.matched.length - 1]
        ?.parent?.path;
      const currentRoute = this.getCurrentRoute(
        parentPath,
        this.$router.options.routes
      );
      return currentRoute?.children?.filter(this.filterUIRoutes) ?? [];
    }
  },
  methods: {
    // return true if the item has a showInUi property with a value
    // of true AND, if requiredClaims are present in the router, the user has
    // at least one of those claims. Return false otherwise.
    filterUIRoutes(item: RouteConfig) {
      const requiredClaims = item.meta?.requiredClaims;
      if (
        requiredClaims &&
        Array.isArray(requiredClaims) &&
        requiredClaims.length > 0
      ) {
        // requiredClaims array is defined in the router, ensure that
        // the user has the required claims by checking that the intersect
        // of the user's claims and the list of requiredClaims
        // has at least one element.
        const intersect = requiredClaims.filter((y: string) =>
          Object.prototype.hasOwnProperty.call(this.claims, y)
        );
        // ensure the value of at least one item is true and that showInUI
        // is also true, otherwise don't put the route in the return list
        return (
          intersect.some((y: string) => this.claims[y] === true) &&
          item.meta?.showInUi === true
        );
      }
      // there are no requiredClaims, determine whether to include the
      // route excluively on the value of showInUi
      return item.meta?.showInUi === true;
    },
    // Dynamically generate action links
    //https://github.com/vuejs/vue-router/issues/1149
    getCurrentRoute(
      path: string | undefined,
      children: RouteConfig[] | undefined
    ): RouteConfig | null {
      if (path && children) {
        for (const child of children) {
          if (path.length === 0 && child.path.length === 0) {
            return child;
          }
          if (path.startsWith(child.path)) {
            let index = child.path.length;
            if (child.path !== "/") {
              index++; // remove the '/' at the end
            }
            const subPath = path.substring(index);

            // we reach the end of the path to resolved
            if (subPath.length === 0) {
              return child;
            } else if (child.children !== undefined) {
              const found = this.getCurrentRoute(subPath, child.children);
              if (found) {
                return found;
              }
            }
          }
        }
      }
      return null;
    }
  }
});
</script>