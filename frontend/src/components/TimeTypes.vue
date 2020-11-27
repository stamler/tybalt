<template>
  <div>
    <div class="actions">
      <router-link class="navlink" v-bind:to="{ name: 'Time Types List' }">
        List
      </router-link>
      <router-link
        class="navlink"
        v-bind:to="{ name: 'Add Time Type' }"
        v-if="hasPermission('admin')"
      >
        New
      </router-link>
    </div>
    <router-view />
  </div>
</template>

<script lang="ts">
import mixins from "./mixins";
export default mixins.extend({}); // hasPermission() is in the mixin
</script>
