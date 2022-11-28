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
import { defineComponent } from "vue";
import { searchString } from "./helpers";
import { EditIcon } from "vue-feather-icons";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  collection,
  CollectionReference,
  DocumentData,
} from "firebase/firestore";
const db = getFirestore(firebaseApp);

export default defineComponent({
  props: ["collectionName"], // a string, the Firestore Collection name
  components: {
    EditIcon,
  },
  computed: {
    processedItems(): DocumentData[] {
      return this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .filter(
          (p: DocumentData) =>
            searchString(p).indexOf(this.search.toLowerCase()) >= 0
        );
    },
  },
  data() {
    return {
      search: "",
      parentPath: "",
      collectionObject: null as CollectionReference | null,
      items: [],
    };
  },
  watch: {
    collection: {
      immediate: true,
      handler(collectionName) {
        this.parentPath =
          this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
        this.collectionObject = collection(db, collectionName);
        this.$firestoreBind("items", this.collectionObject);
      },
    },
  },
});
</script>
