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

<script lang="ts">
import mixins from "./mixins";
import { mapState } from "vuex";
import { EditIcon } from "vue-feather-icons";
import firebase from "../firebase";
const db = firebase.firestore();

export default mixins.extend({
  props: ["collection"], // a string, the Firestore Collection name
  components: {
    EditIcon,
  },
  computed: {
    ...mapState(["claims"]),
    processedItems(): firebase.firestore.DocumentData[] {
      return this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .filter(
          (p) => this.searchString(p).indexOf(this.search.toLowerCase()) >= 0
        );
    },
  },
  data() {
    return {
      search: "",
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      items: [],
    };
  },
  watch: {
    collection: {
      immediate: true,
      handler(collection) {
        this.parentPath =
          this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ??
          "";
        this.collectionObject = db.collection(collection);
        this.$bind("items", this.collectionObject);
      },
    },
  },
});
</script>
