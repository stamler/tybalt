<template>
  <div id="container">
    <div>
      <input type="textbox" placeholder="search..." v-model="search" />
      <button v-if="del" v-on:click="deleteSelected()">
        Delete {{ selected.length }} items
      </button>
    </div>
    <table>
      <thead>
        <tr>
          <th v-if="select">
            <input type="checkbox" v-model="selectAll" v-on:click="toggleAll()">
            {{ selected.length }}/{{ processedItems.length }}
          </th>
          <th v-else>
            {{ processedItems.length }}
          </th>
          <th v-for="col in fields" v-bind:key="col">
            <!-- the schema specifies not to sort on this column  -->
            <span v-if="schema[col] && schema[col].sort === false">
              {{ schema[col] && schema[col].display ? schema[col].display : col }}
            </span>
            <!-- the schema specifies this column is an id -->
            <a v-else-if="schema[col] && schema[col].id" href="#" v-on:click="sort('id')">
              {{ schema[col] && schema[col].display ? schema[col].display : col }}
            </a>
            <!-- sort on this regular column -->
            <a v-else href="#" v-on:click="sort(col)">
              {{ schema[col] && schema[col].display ? schema[col].display : col }}
            </a>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in processedItems" v-bind:key="item.id">
          <!-- selection checkbox -->
          <td>
            <input v-if="select" type="checkbox" v-bind:value="item.id" v-model="selected">
          </td>
          <!-- columns  -->
          <td v-for="field in fields" v-bind:key="field">
            {{ renderCell(field, item) }}
          </td>
          <!-- edit button  -->
          <td v-if="edit"><router-link :to="[parentPath,item.id,'edit'].join('/')">✏️</router-link></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
import moment from "moment";
import { mapState } from "vuex";
import firebase from "@/firebase";
const db = firebase.firestore();

export default {
  data() {
    return {
      select: false,
      edit: false,
      del: false,
      parentPath: null,
      schema: null, // schema: a reference to the parent schema
      collection: null, // collection: a reference to the parent collection
      taskAreaMode: "default",
      items: [],
      search: "",
      sortBy: "created",
      sortDescending: true,
      selectAll: false,
      selected: []
    };
  },
  created() {
    this.select = this.$parent.select;
    this.edit = this.$parent.edit;
    this.del = this.$parent.del;
    this.parentPath = this.$route.matched[this.$route.matched.length-1].parent.path;
    this.schema = this.$parent.schema;
    this.collection = this.$parent.collection;
    this.items = this.$parent.items;
    this.$bind("items", this.items);
  },
  computed: {
    fields() {
      return Object.keys(this.schema);
    },
    processedItems() {
      return this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .sort((a, b) => {
          const direction = this.sortDescending ? -1 : 1;
          if (a[this.sortBy] < b[this.sortBy]) return -1 * direction;
          else if (a[this.sortBy] > b[this.sortBy]) return 1 * direction;
          return 0;
        })
        .filter(
          p => this.searchString(p).indexOf(this.search.toLowerCase()) >= 0
        );
    },
    // the spread operator allows including the mapped computed properties
    ...mapState(["claims"])
  },
  methods: {
    renderCell(field, item) {
      const value = this.schema[field] && this.schema[field].id === true ? item.id : item[field];
      const derivation = this.schema[field].derivation;
      return derivation ? derivation(item) : value;
    },
    toggleAll() {
      this.selected = [];
      if (!this.selectAll) {
        for (let i in this.items) {
          this.selected.push(this.items[i].id);
        }
      }
    },
    sort(property) {
      this.sortDescending = !this.sortDescending;
      this.sortBy = property;
    },
    searchString(item) {
      const fields = Object.values(item);
      fields.push(item.id);
      return fields
        .join(",")
        .toLowerCase();
    },
    deleteSelected() {
      const batch = db.batch();
      this.selected.forEach(key => {
        // apparently Vuefire $bind on items removes the doc() function so we
        // use collection instead of items. TODO: research and understand this
        batch.delete(this.collection.doc(key));
      });
      batch
        .commit()
        .then(() => {
          this.selected = [];
          this.selectAll = false;
        })
        .catch(err => {
          console.log(`Batch failed: ${err}`);
        });
    }
  }  
}
</script>
