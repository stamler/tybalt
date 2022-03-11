<template>
  <router-link to="#" v-on:click.native="download()">
    <download-icon></download-icon>
  </router-link>
</template>
<script lang="ts">
import mixins from "./mixins";
import store from "../store";
import firebase from "../firebase";
import { parse } from "json2csv";
import { DownloadIcon } from "vue-feather-icons";
import { QueryPayloadObject } from "./types";

export default mixins.extend({
  props: {
    queryName: String,
    queryValues: Array,
    dlFileName: String,
  },
  components: { DownloadIcon },
  methods: {
    async download() {
      const result = await this.runQuery();
      const csv = parse(result);
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
