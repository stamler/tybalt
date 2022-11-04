<template>
  <div id="list">
    <div id="listbar">
      <input
        id="searchbox"
        type="textbox"
        placeholder="search..."
        v-model="search"
      />
      <span>{{ processedItems.length }} items</span>
    </div>
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
import Vue from "vue";
import { searchString } from "./helpers";
import { EditIcon } from "vue-feather-icons";
import firebase from "../firebase";
const db = firebase.firestore();

export default Vue.extend({
  props: ["collection"], // a string, the Firestore Collection name
  components: {
    EditIcon,
  },
  computed: {
    processedItems(): firebase.firestore.DocumentData[] {
      return this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .filter(
          (p: firebase.firestore.DocumentData) =>
            searchString(p).indexOf(this.search.toLowerCase()) >= 0
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
