<template>
  <action-button type="download" title="download report" @click="download()" />
</template>
<script lang="ts">
import { defineComponent } from "vue";
import { useStateStore } from "../stores/state";
import firebase from "../firebase";
import { parse } from "json2csv";
import ActionButton from "./ActionButton.vue";
import { QueryPayloadObject } from "./types";
import { downloadBlob } from "./helpers";

export default defineComponent({
  setup() {
    const store = useStateStore();
    const { startTask, endTask } = store;
    return { startTask, endTask };
  },
  props: {
    queryName: String,
    queryValues: Array,
    dlFileName: String,
  },
  components: { ActionButton },
  methods: {
    async download() {
      const result = await this.runQuery();
      const csv = parse(result);
      const blob = new Blob([csv], { type: "text/csv" });
      const name = this.dlFileName || "report.csv";
      downloadBlob(blob, name);
    },
    runQuery() {
      this.startTask({
        id: "runQuery",
        message: "getting data...",
      });
      const queryMySQL = firebase.functions().httpsCallable("queryMySQL");
      const queryData = { queryName: this.queryName } as QueryPayloadObject;
      if (this.queryValues !== undefined)
        queryData.queryValues = this.queryValues;
      return queryMySQL(queryData)
        .then((response) => {
          this.endTask("runQuery");
          return response.data;
        })
        .catch((error) => {
          this.endTask("runQuery");
          alert(`Error running query: ${error.message}`);
        });
    },
  },
});
</script>
