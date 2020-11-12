<template>
  <span>
    <half-circle-spinner display: inline v-bind:size="20"></half-circle-spinner> 
    {{ oneMessage }}
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
    ...mapGetters(["oneMessage"]),
  },
}
</script>

<style>

</style>