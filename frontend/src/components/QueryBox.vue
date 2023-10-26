<template>
  <div>
    <object-table :tableData="queryResult"></object-table>
    <action-button
      type="download"
      title="download report"
      @click="download()"
      v-if="queryResult !== undefined && queryResult.length > 0"
    />
  </div>
</template>
<script lang="ts">
import { firebaseApp } from "../firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { defineComponent } from "vue";
import ActionButton from "./ActionButton.vue";
import { downloadBlob } from "./helpers";
import { useStateStore } from "../stores/state";
import ObjectTable from "./ObjectTable.vue";
import { parse } from "json2csv";
import { TableData, QueryPayloadObject } from "./types";

const functions = getFunctions(firebaseApp);

export default defineComponent({
  setup() {
    const store = useStateStore();
    const { startTask, endTask } = store;
    return { startTask, endTask };
  },
  data() {
    return {
      queryResult: undefined as TableData,
    };
  },
  props: {
    queryName: String,
    queryValues: Array,
    dlFileName: String,
  },
  components: { ObjectTable, ActionButton },
  methods: {
    download() {
      if (this.queryResult === undefined) return;
      const csv = parse(this.queryResult);
      const blob = new Blob([csv], { type: "text/csv" });
      const name = this.dlFileName || "report.csv";
      downloadBlob(blob, name);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async runQuery(key: string) {
      this.startTask({
        id: `runQuery_${key}`,
        message: "getting data...",
      });
      const queryMySQL = httpsCallable(functions, "queryMySQL");
      const queryData = { queryName: this.queryName } as QueryPayloadObject;
      if (this.queryValues !== undefined)
        queryData.queryValues = this.queryValues;
      return queryMySQL(queryData)
        .then((response) => {
          this.endTask(`runQuery_${key}`);
          this.queryResult = response.data as TableData;
        })
        .catch((error) => {
          this.endTask(`runQuery_${key}`);
          alert(`Error running query: ${error.message}`);
        });
    },
  },
  created() {
    this.runQuery(this.queryName ?? "");
  },
  watch: {
    queryName: function () {
      this.runQuery(this.queryName ?? "");
    },
    queryValues: function () {
      this.runQuery(this.queryName ?? "");
    },
  },
});
</script>
