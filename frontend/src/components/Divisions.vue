<template>
  <div>
    <div class="actions">
      <router-link class="navlink" v-bind:to="{ name: 'Divisions List' }">
        List
      </router-link>
      <router-link
        class="navlink"
        v-bind:to="{ name: 'Add Division' }"
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
export default mixins.extend({});
</script>
