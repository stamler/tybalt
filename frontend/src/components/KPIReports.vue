<template>
  <div>
    <h1>Reports</h1>
    <span class="field">
      <select class="grow" name="reportName" v-model="reportName">
        <option v-for="n in reports" :value="n" v-bind:key="n">
          {{ n }}
        </option>
      </select>
    </span>
    <query-box :queryName="reportName"></query-box>
  </div>
</template>
<script lang="ts">
import { defineComponent } from "vue";
import QueryBox from "./QueryBox.vue";
import { TableData } from "./types";

export default defineComponent({
  components: { QueryBox },
  data() {
    return {
      reports: [
        "utilizationRate",
        "utilizationRate-withTimeOff",
        "stats",
        "timetypeSummary",
      ],
      reportName: "utilizationRate",
      result: undefined as TableData,
    };
  },
});
</script>
