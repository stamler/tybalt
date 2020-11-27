<template>
  <div>
    <div class="actions">
      <router-link class="navlink" v-bind:to="{ name: 'Time Entries List' }">
        List
      </router-link>
      <router-link class="navlink" v-bind:to="{ name: 'Add Time Entry' }">
        New
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
