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
import Vue from "vue";
import QueryBox from "./QueryBox.vue";
import { TableData } from "./types";

export default Vue.extend({
  components: { QueryBox },
  data() {
    return {
      reports: ["stats", "payrollReport-TimeEntriesOnly"],
      reportName: "",
      result: undefined as TableData,
    };
  },
});
</script>
