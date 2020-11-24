<template>
  <div>
    <div class="actions">
      <router-link class="navlink" to="list">List</router-link>
      <router-link class="navlink" v-if="hasPermission('admin')" to="add">
        New
      </router-link>
    </div>
    <router-view />
  </div>
</template>

<script lang="ts">
import mixins from "./mixins";
// We extend mixins because hasPermission() is in the mixin
export default mixins.extend({});
</script>
