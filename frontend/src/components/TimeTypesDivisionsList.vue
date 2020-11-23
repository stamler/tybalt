<template>
  <div id="list">
    <input
      id="searchbox"
      type="textbox"
      placeholder="search..."
      v-model="search"
    />
    <div class="listentry" v-for="item in processedItems" v-bind:key="item.id">
      <div class="anchorbox">{{ item.id }}</div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">{{ item.name }}</div>
        </div>
        <div class="firstline">{{ item.description }}</div>
      </div>
      <div class="rowactionsbox">
        <router-link :to="[parentPath, item.id, 'edit'].join('/')">
          <edit-icon></edit-icon>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script>
import mixins from "./mixins";
import { mapState } from "vuex";
import { EditIcon } from "vue-feather-icons";

export default {
  mixins: [mixins],
  components: {
    EditIcon
  },
  computed: {
    ...mapState(["claims"]),
    processedItems() {
      return this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .filter(
          p => this.searchString(p).indexOf(this.search.toLowerCase()) >= 0
        );
    }
  },
  data() {
    return {
      search: "",
      parentPath: null,
      collection: null, // collection: a reference to the parent collection
      items: []
    };
  },
  created() {
    this.parentPath = this.$route.matched[
      this.$route.matched.length - 1
    ].parent.path;
    this.collection = this.$parent.collection;
    this.items = this.$parent.items;
    this.$bind("items", this.items);
  },
  methods: {
    del(item) {
      this.collection
        .doc(item)
        .delete()
        .catch(err => {
          alert(`Error deleting item: ${err}`);
        });
    }
  }
};
</script>
