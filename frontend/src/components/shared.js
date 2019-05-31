/* The base JS for components with a sortable table of items */

import moment from "moment";
import { mapState } from "vuex";
import Editor from "./Editor";
import firebase from "@/firebase";
const db = firebase.firestore();

const componentMaker = function() {
  return {
    components: {
      Editor
    },
    props: ["schema", "collection"],
    data() {
      return {
        showNewItem: false, // show or hide the Editor for new item
        editingObject: {}, // An object of the firestore collection
        taskAreaMode: "default",
        items: [],
        search: "",
        sortBy: "created",
        sortDescending: true,
        selectAll: false,
        selected: []
      };
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
      clearEditor() {
        this.editingObject = {};
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
};
export default componentMaker;
