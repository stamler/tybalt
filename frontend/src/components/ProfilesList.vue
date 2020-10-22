<template>
  <div id="list">
    <input
      id="searchbox"
      type="textbox"
      placeholder="search..."
      v-model="search"
    />

    <div class="listentry" v-for="item in processedItems" v-bind:key="item.id">
      <div class="anchorbox">{{ item.displayName }}</div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">{{ item.email }}</div>
        </div>
        <div class="firstline">
          {{ item.customClaims | keysString }}
        </div>
        <div class="secondline">Manager: {{ item.manager_name }}</div>
        <div class="thirdline"></div>
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
      return this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .filter(
          p => this.searchString(p).indexOf(this.search.toLowerCase()) >= 0
        );
    }
  },
  filters: {
    keysString(obj) {
      return obj ? Object.keys(obj).join(", ") : "";
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
    this.$bind("items", this.$parent.items).catch(error => {
      alert(`Can't load Profiles: ${error.message}`);
    });
  },
  methods: {
    del(item) {
      this.collection
        .doc(item)
        .delete()
        .catch(err => {
          console.log(err);
        });
    },
    searchString(item) {
      const fields = Object.values(item);
      fields.push(item.id);
      return fields.join(",").toLowerCase();
    }
  }
};
</script>
<style scoped>
.anchorbox {
  flex-basis: 6.8em;
}
</style>
