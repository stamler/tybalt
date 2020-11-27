<template>
  <div>
    <div class="actions">
      <router-link class="navlink" v-bind:to="{ name: 'Time Tracking List' }">
        List
      </router-link>
      <WaitMessages v-if="showTasks" />
    </div>
    <router-view />
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import WaitMessages from "./WaitMessages.vue";
import { mapState } from "vuex";

export default Vue.extend({
  components: { WaitMessages },
  computed: mapState(["showTasks"])
});
</script>
