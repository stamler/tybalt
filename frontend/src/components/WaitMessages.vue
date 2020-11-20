<template>
  <span>
    {{ oneMessage }}
    <half-circle-spinner
      style="display:inline-block;"
      v-bind:size="20"
    ></half-circle-spinner>
  </span>
</template>

<script lang="ts">
import { HalfCircleSpinner } from "epic-spinners";
import { mapGetters, mapState } from "vuex";
import Vue from "vue";

export default Vue.extend({
  components: {
    HalfCircleSpinner
  },
  computed: {
    ...mapState(["showTasks"]),
    ...mapGetters(["oneMessage"])
  }
});
</script>

<style></style>
