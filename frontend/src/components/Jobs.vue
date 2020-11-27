<template>
  <div>
    <div class="actions">
      <router-link class="navlink" v-bind:to="{ name: 'Jobs List' }">
        List
      </router-link>
      <router-link
        class="navlink"
        v-bind:to="{ name: 'Add Job' }"
        v-if="hasPermission('job')"
      >
        New
      </router-link>
    </div>
    <router-view />
  </div>
</template>

<script lang="ts">
import mixins from "./mixins";
import { mapState } from "vuex";
export default mixins.extend({ computed: mapState(["claims"]) });
</script>
