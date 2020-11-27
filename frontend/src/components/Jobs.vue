<template>
  <div>
    <div class="actions">
      <router-link class="navlink" to="list">List</router-link>
      <router-link class="navlink" v-if="hasPermission('job')" to="add">
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
