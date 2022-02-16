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
    <div v-if="result !== undefined" v-html="renderTable(result)"></div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import store from "../store";
import firebase from "../firebase";
export default Vue.extend({
  data() {
    return {
      reports: ["stats", "payrollReport-TimeEntriesOnly"],
      reportName: "",
      result: undefined as Record<string, any>[] | undefined,
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
          this.result = response.data;
          store.commit("endTask", { id: "runReport" });
        })
        .catch((error) => {
          store.commit("endTask", { id: "runReport" });
          alert(`Error running report: ${error.message}`);
        });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    renderTable(data: Record<string, any>[]) {
      const fields = Object.keys(data[0]);
      const header =
        "<tr>" + fields.map((x) => `<th>${x}</th>`).join("") + "</tr>";

      const values = data
        .map((row) => {
          return (
            "<tr>" +
            fields
              .map((field: any) => {
                return `<td>${row[field]}</td>`;
              })
              .join("") +
            "</tr>"
          );
        })
        .join("");
      return "<table>" + header + values + "</table>";
    },
  },
});
</script>
