<template>
  <div>
    <div class="actions">
      <router-link class="navlink" to="list">List</router-link>
      <router-link class="navlink" to="add">New</router-link>
      <WaitMessages v-if="showTasks" />
    </div>
    <router-view />
  </div>
</template>

<script lang="ts">
import Vue from "vue";
import { mapState } from "vuex";
import WaitMessages from "./WaitMessages.vue";

export default Vue.extend({
  components: {
    WaitMessages
  },
  computed: {
    ...mapState(["showTasks"])
  }
});
</script>
