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
    <button v-on:click="runReport(reportName)">Run Report</button>
    <object-table :tableData="result"></object-table>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import store from "../store";
import firebase from "../firebase";
import ObjectTable from "./ObjectTable.vue";
import { TableData } from "./types";

export default Vue.extend({
  components: { ObjectTable },
  data() {
    return {
      reports: ["stats", "payrollReport-TimeEntriesOnly"],
      reportName: "",
      result: undefined as TableData,
    };
  },
  methods: {
    runReport(name: string) {
      store.commit("startTask", {
        id: "runReport",
        message: "getting report...",
      });
      const queryMySQL = firebase.functions().httpsCallable("queryMySQL");
      return queryMySQL({ queryName: name })
        .then((response) => {
          store.commit("endTask", { id: "runReport" });
          this.result = response.data;
        })
        .catch((error) => {
          store.commit("endTask", { id: "runReport" });
          alert(`Error running report: ${error.message}`);
        });
    },
  },
});
</script>
