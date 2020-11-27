<template>
  <div>
    <div class="actions">
      <router-link class="navlink" v-bind:to="{ name: 'Logins List' }">
        List
      </router-link>
    </div>
    <router-view />
  </div>
</template>

<script lang="ts">
import { mapState } from "vuex";
export default { computed: mapState(["claims"]) };
</script>
