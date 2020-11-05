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
        <div class="firstline">{{ item.manager }} for {{ item.client }}</div>
        <div class="secondline">{{ item.proposal }} {{ item.status }}</div>
        <div class="thirdline">{{ item.description }}</div>
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
import { mapState } from "vuex";
import { EditIcon } from "vue-feather-icons";

export default {
  components: {
    EditIcon
  },
  computed: {
    ...mapState(["claims"]),
    processedItems() {
      // display maximum of 100 items though there may be way more
      // TODO: don't pull more than 100 items from the server at a time
      // scroll to the bottom to load more
      // TODO: possibly use full text search like
      // https://www.npmjs.com/package/adv-firestore-functions
      return this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .filter(
          p => this.searchString(p).indexOf(this.search.toLowerCase()) >= 0
        )
        .slice(0,100);
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
    searchString(item) {
      const fields = Object.values(item);
      fields.push(item.id);
      return fields.join(",").toLowerCase();
    }
  }
};
</script>
