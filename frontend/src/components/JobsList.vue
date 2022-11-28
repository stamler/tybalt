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
          <div class="headline">{{ item.client }}</div>
          <div class="byline">{{ item.description }}</div>
        </div>
        <div class="firstline">{{ item.manager }}</div>
        <div class="secondline">{{ item.proposal }} {{ item.status }}</div>
        <div v-if="item.clientContact" class="thirdline">
          Contact: {{ item.clientContact }}
        </div>
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
import { mapState } from "vuex";
import { EditIcon } from "vue-feather-icons";
import firebase from "../firebase";
const db = firebase.firestore();
export default Vue.extend({
  props: ["collection"],
  components: {
    EditIcon,
  },
  computed: {
    ...mapState(["claims"]),
    processedItems(): firebase.firestore.DocumentData[] {
      // display maximum of 100 items though there may be way more
      // TODO: don't pull more than 50 items from the server at a time
      // scroll to the bottom to load more (infinite scroll)
      // TODO: possibly use full text search like
      // https://www.npmjs.com/package/adv-firestore-functions
      return this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .filter(
          (p: firebase.firestore.DocumentData) =>
            searchString(p).indexOf(this.search.toLowerCase()) >= 0
        )
        .slice(0, 100);
    },
  },
  data() {
    return {
      search: "",
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      items: [] as firebase.firestore.DocumentData[],
    };
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.$bind("items", this.collectionObject);
  },
});
</script>
