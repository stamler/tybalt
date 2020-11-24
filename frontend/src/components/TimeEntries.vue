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

<script>
import { mapState } from "vuex";
import WaitMessages from "./WaitMessages";

export default {
  components: {
    WaitMessages
  },
  computed: {
    ...mapState(["showTasks"])
  }
};
</script>
