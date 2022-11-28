<template>
  <div id="sidenav">
    <ul>
      <li v-for="link in links" v-bind:key="link.name">
        {{ link.name }}
        <ul v-if="link.children && link.children.length > 0">
          <li v-for="child in link.children" v-bind:key="child.name">
            <router-link class="link" v-bind:to="{ name: child.name }">
              {{ child.name }}
            </router-link>
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { RouteRecordRaw } from "vue-router";
import { useStateStore } from "../stores/state";

export default defineComponent({
  setup() {
    const store = useStateStore();
    return { claims: store.claims };
  },

  computed: {
    // top level router entries that have a name property and are allowed
    links(): RouteRecordRaw[] {
      return (
        this?.$router?.options?.routes?.filter((x: RouteRecordRaw) => {
          if (x.name) {
            // filter out entries we don't have claims for if
            // next line is false to enable UI filtering by claims
            // eslint-disable-next-line no-constant-condition
            if (true) {
              // ATTENTION: this feature is hard disabled here
              // TODO: enable it and test
              return true;
            } else {
              if (x.meta && x.meta?.claims) {
                // There are claims requirements for this route, validate
                // them by getting intersect of link.claims & this.claims
                let intersect = [];
                if (Array.isArray(x.meta?.claims)) {
                  const requiredClaims = x.meta?.claims as string[];
                  intersect = requiredClaims.filter((y: string) =>
                    Object.prototype.hasOwnProperty.call(this.claims, y)
                  );
                }
                // ensure the value of at least one item is true
                return intersect.some((y: string) => this.claims[y] === true);
              } else {
                return true;
              }
            }
          } else {
            return false;
          }
        }) ?? []
      );
    },
  },
});
</script>
