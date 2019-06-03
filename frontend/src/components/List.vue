<template>
  <div id="container">
    <div>
      <input type="textbox" placeholder="search..." v-model="search" />
      <button v-if="claims.projects === true" v-on:click="deleteSelected()">
        Delete {{ selected.length }} items
      </button>
    </div>
    <table>
      <thead>
        <tr>
          <th>
            <input type="checkbox" v-model="selectAll" v-on:click="toggleAll()">
            {{ selected.length }}/{{ processedItems.length }}
          </th>
          <th v-for="col in Object.keys(schema)" v-bind:key="col">
            <span v-if="schema[col] && schema[col].sort === false">
              {{ schema[col] && schema[col].display ? schema[col].display : col }}
            </span>
            <a v-else-if="schema[col] && schema[col].id" href="#" v-on:click="sort('id')">
              {{ schema[col] && schema[col].display ? schema[col].display : col }}
            </a>
            <a v-else href="#" v-on:click="sort('id')">
              {{ schema[col] && schema[col].display ? schema[col].display : col }}
            </a>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in processedItems" v-bind:key="item.id">
          <td>
            <input type="checkbox" v-bind:value="item.id" v-model="selected">
          </td>
          <td v-for="col in Object.keys(schema)" v-bind:key="col">
            {{ schema[col] && schema[col].id === true ? item.id : item[col] }}
          </td>  
          <td><button>✏️</button></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
import moment from "moment";
import { mapState } from "vuex";
import Editor from "./Editor";
import firebase from "@/firebase";
const db = firebase.firestore();

export default {
  components: {
    Editor
  },
  data() {
    return {
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
    this.schema = this.$parent.schema;
    this.collection = this.$parent.collection;
    this.items = this.$parent.items;
    this.$bind("items", this.items);
  },
  filters: {
    shortDate(date) {
      return moment(date).format("MMM DD");
    },
    dateFormat(date) {
      return moment(date).format("YYYY MMM DD / HH:mm:ss");
    },
    relativeTime(date) {
      return moment(date).fromNow();
    }
  },
  computed: {
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
    ...mapState(["claims", "state", "user"])
  },
  methods: {
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
      return Object.values(item)
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
