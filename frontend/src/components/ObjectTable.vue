<template>
  <div
    v-if="internalTableData !== undefined || Array.isArray(internalTableData)"
  >
    <div id="tablecontainer">
      <table v-if="internalTableData.length > 0">
        <thead class="heading">
          <tr>
            <th v-for="col in columns" v-bind:key="col">
              <action-button title="sort" @click="sort(col)">
                {{ col }}
              </action-button>
              <span id="sortIndicator">
                <template v-if="sortColumn === col">
                  <template v-if="order === 2">
                    <!-- DESCENDING -->
                    <Icon icon="feather:arrow-down" width="24px" />
                  </template>
                  <template v-else-if="order === 1">
                    <!-- ASCENDING -->
                    <Icon icon="feather:arrow-up" width="24px" />
                  </template>
                  <template v-else><!--- UNSORTED --></template>
                </template>
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in internalTableData" v-bind:key="row.id">
            <td v-for="col in columns" v-bind:key="col">
              {{ row[col] }}
            </td>
          </tr>
        </tbody>
      </table>
      <span v-else>No Data</span>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import _ from "lodash";
import { Icon } from "@iconify/vue";
import { TableData } from "./types";
import ActionButton from "./ActionButton.vue";

export default defineComponent({
  components: {
    ActionButton,
    Icon,
  },
  props: { tableData: Array },
  data() {
    return {
      sortColumn: "",
      order: 0,
      internalTableData: undefined as TableData,
    };
  },
  computed: {
    columns(): string[] {
      return this.internalTableData === undefined ||
        this.internalTableData.length === 0
        ? []
        : Object.keys(this.internalTableData[0]);
    },
  },
  watch: {
    tableData: function (dat) {
      this.internalTableData = dat;
    },
  },
  methods: {
    sort(column: string) {
      this.sortColumn = column;
      this.order = (this.order + 1) % 3;
      switch (this.order) {
        case 0: // unsorted
          this.internalTableData = this.tableData as TableData;
          return;
        case 1: // ascending
          return (this.internalTableData = _.orderBy(
            this.tableData,
            column,
            "asc"
          ) as TableData);
        case 2: // descending
          return (this.internalTableData = _.orderBy(
            this.tableData,
            column,
            "desc"
          ) as TableData);
      }
    },
  },
});
</script>
<style scoped>
#tablecontainer {
  overflow-x: auto;
  white-space: nowrap;
}
#sortIndicator {
  height: 1.2em;
  width: 1em;
  display: inline-block;
}
table {
  border-collapse: collapse;
  border: none;
}
thead a {
  text-decoration: none;
}
thead a:hover {
  text-decoration: underline;
}
thead th {
  vertical-align: bottom;
  padding-right: 1em;
  border-bottom: 1px solid grey;
}
td {
  padding-right: 3em;
}
</style>
