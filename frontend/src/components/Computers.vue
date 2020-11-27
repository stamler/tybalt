<template>
  <div>
    <div class="actions">
      <router-link class="navlink" v-bind:to="{ name: 'Computers List' }">
        List
      </router-link>
      <router-link class="navlink" v-bind:to="{ name: 'Retired Computers' }">
        Retired
      </router-link>
    </div>
    <router-view />
  </div>
</template>

<script lang="ts">
import { mapState } from "vuex";
export default { computed: mapState(["claims"]) };
</script>
