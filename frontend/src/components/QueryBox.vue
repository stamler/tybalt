<template>
  <div>
    <object-table :tableData="queryResult"></object-table>
    <router-link
      to="#"
      v-on:click.native="download()"
      v-if="queryResult !== undefined && queryResult.length > 0"
    >
      <download-icon></download-icon>
    </router-link>
  </div>
</template>
<script lang="ts">
import mixins from "./mixins";
import store from "../store";
import firebase from "../firebase";
import ObjectTable from "./ObjectTable.vue";
import { parse } from "json2csv";
import { DownloadIcon } from "vue-feather-icons";
import { TableData, QueryPayloadObject } from "./types";

export default mixins.extend({
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
  components: { DownloadIcon, ObjectTable },
  methods: {
    download() {
      if (this.queryResult === undefined) return;
      const csv = parse(this.queryResult);
      const blob = new Blob([csv], { type: "text/csv" });
      const name = this.dlFileName || "report.csv";
      this.downloadBlob(blob, name);
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
          this.queryResult = response.data;
        })
        .catch((error) => {
          store.commit("endTask", { id: "runQuery" });
          alert(`Error running query: ${error.message}`);
        });
    },
  },
  created() {
    this.runQuery();
  },
  watch: {
    queryName: function () {
      this.runQuery();
    },
    queryValues: function () {
      this.runQuery();
    },
  },
});
</script>
