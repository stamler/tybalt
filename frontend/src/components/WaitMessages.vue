<template>
  <span>
    {{ oneMessage }}
    <div class="lds-ring">
      <div></div>
    </div>
  </span>
</template>

<script lang="ts">
import { useStateStore } from "../stores/state";
import { defineComponent } from "vue";

export default defineComponent({
  setup() {
    const store = useStateStore();
    return { oneMessage: store.oneMessage };
  },
});
</script>

<style scoped>
@import "./lds-ring.css";
</style>
