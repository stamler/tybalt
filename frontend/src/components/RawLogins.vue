<template>
  <div>
    <div class="actions">
      <router-link class="navlink" v-bind:to="{ name: 'Raw Logins List' }">
        List
      </router-link>
    </div>
    <router-view />
  </div>
</template>

<script>
import { mapState } from "vuex";
export default {
  computed: {
    ...mapState(["claims"])
  }
};
</script>
