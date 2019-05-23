/* The base JS for components with a sortable table of items */

import moment from "moment";
import { mapState } from "vuex";

const componentMaker = function(items, limit = 300, order) {
  if (order) {
    items = items.orderBy(...order).limit(limit);
  } else {
    items = items.limit(limit);
  }
  return {
    data() {
      return {
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
      this.$bind("items", items);
    },
    filters: {
      dateFormat(date) {
        return moment(date).format("YYYY MMM DD / HH:mm:ss");
      },
      relativeTime(date) {
        return moment(date).fromNow();
      }
    },
    computed: {
      processedItems() {
        // slice() shallow-copies the array https://github.com/vuejs/vuefire/issues/244
        return this.items.slice()
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
      }
    }
  };
};
export default componentMaker;
