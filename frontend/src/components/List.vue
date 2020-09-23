<template>
  <div id="list">
    <div id="taskArea">
      <div v-if="taskAreaMode === 'default'">
        <input
          id="searchbox"
          type="textbox"
          placeholder="search..."
          v-model="search"
        />
        <button v-if="del" v-on:click="deleteSelected()">
          Delete {{ selected.length }} items
        </button>
        <slot
          name="taskAreaDefault"
          v-bind:taskAreaMode="taskAreaMode"
          v-bind:setTaskMode="setTaskMode"
        />
      </div>
      <div v-else>
        <slot
          name="taskAreaNonDefault"
          v-bind:taskAreaMode="taskAreaMode"
          v-bind:setTaskMode="setTaskMode"
        />
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th v-if="select">
            <input
              type="checkbox"
              v-model="selectAll"
              v-on:click="toggleAll()"
            />
            {{ selected.length }}/{{ processedItems.length }}
          </th>
          <th v-else>{{ processedItems.length }}</th>
          <slot name="headers" v-bind:sort="sort">
            <!-- Existing code becomes fallback -->
            <th v-for="col in fields" v-bind:key="col">
              <!-- the schema specifies not to sort on this column  -->
              <span v-if="schema[col] && schema[col].sort === false">
                {{
                  schema[col] && schema[col].display ? schema[col].display : col
                }}
              </span>
              <!-- the schema specifies this column is an id -->
              <a
                v-else-if="schema[col] && schema[col].id"
                href="#"
                v-on:click="sort('id')"
              >
                {{
                  schema[col] && schema[col].display ? schema[col].display : col
                }}
              </a>
              <!-- sort on this regular column -->
              <a v-else href="#" v-on:click="sort(col)">
                {{
                  schema[col] && schema[col].display ? schema[col].display : col
                }}
              </a>
            </th>
          </slot>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in processedItems" v-bind:key="item.id">
          <!-- selection checkbox -->
          <td>
            <input
              v-if="select"
              type="checkbox"
              v-bind:value="item.id"
              v-model="selected"
            />
          </td>
          <!-- columns  -->
          <slot name="columns" v-bind:item="item" />
          <!-- edit button  -->
          <td v-if="edit">
            <router-link :to="[parentPath, item.id, 'edit'].join('/')">
              ✏️
            </router-link>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
import { mapState } from "vuex";
import firebase from "@/firebase";
const db = firebase.firestore();

export default {
  props: ["select", "edit", "del"], // select, edit, delete provided by router props
  data() {
    return {
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
    this.parentPath = this.$route.matched[
      this.$route.matched.length - 1
    ].parent.path;
    this.schema = this.$parent.schema;
    this.collection = this.$parent.collection;
    this.items = this.$parent.items;
    this.$bind("items", this.items).catch(error => {
      alert(`Can't load Items: ${error.message}`);
    });
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
    setTaskMode(mode) {
      this.taskAreaMode = mode;
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
      return fields.join(",").toLowerCase();
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
};
</script>
