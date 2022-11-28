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
// import { HalfCircleSpinner } from "epic-spinners";
import { useStateStore } from "../stores/state";
import { defineComponent } from "vue";

export default defineComponent({
  setup() {
    const store = useStateStore();
    return { oneMessage: store.oneMessage };
  },

  components: {
    // HalfCircleSpinner,
  },
});
</script>

<style>
.inline-item {
  display: inline-block;
}
</style>
