<template>
  <span>
    {{ oneMessage }}
    <half-circle-spinner
      class="inline-item"
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

<style>
.inline-item {
  display: inline-block;
}
</style>
