<template>
  <action-button type="download" title="download report" @click="download()" />
</template>
<script lang="ts">
import Vue from "vue";
import store from "../store";
import firebase from "../firebase";
import { parse } from "json2csv";
import ActionButton from "./ActionButton.vue";
import { QueryPayloadObject } from "./types";
import { downloadBlob } from "./helpers";

export default Vue.extend({
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
      store.commit("startTask", {
        id: "runQuery",
        message: "getting data...",
      });
      const queryMySQL = firebase.functions().httpsCallable("queryMySQL");
      const queryData = { queryName: this.queryName } as QueryPayloadObject;
      if (this.queryValues !== undefined)
        queryData.queryValues = this.queryValues;
      return queryMySQL(queryData)
        .then((response) => {
          store.commit("endTask", { id: "runQuery" });
          return response.data;
        })
        .catch((error) => {
          store.commit("endTask", { id: "runQuery" });
          alert(`Error running query: ${error.message}`);
        });
    },
  },
});
</script>
