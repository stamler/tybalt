<template>
  <span>
    {{ oneMessage }}
    <half-circle-spinner
      style="display:inline-block;"
      v-bind:size="20"
    ></half-circle-spinner>
  </span>
</template>

<script>
import { HalfCircleSpinner } from "epic-spinners";
import { mapGetters, mapState } from "vuex";

export default {
  components: {
    HalfCircleSpinner
  },
  computed: {
    ...mapState(["showTasks"]),
    ...mapGetters(["oneMessage"])
  }
};
</script>

<style></style>
