<template>
  <div v-if="searchClientLoaded">
    <img
      style="padding-right: 1em; float: right"
      alt="Algolia required notice"
      src="../assets/search-by-algolia-light-background.png"
    />

    <ais-instant-search
      v-bind:search-client="searchClient"
      index-name="tybalt_jobs"
    >
      <ais-search-box />
      <ais-hits>
        <div slot="item" slot-scope="{ item }">
          <span>{{ item.objectID }}</span>
          <h2>{{ item.client }}</h2>
          <span>{{ item.description }} </span>
          <span>/manager:{{ item.manager }}</span>
          <span v-if="item.proposal">{{ item.proposal }}</span>
          <router-link :to="[parentPath, item.objectID, 'edit'].join('/')">
            <edit-icon></edit-icon>
          </router-link>
        </div>
      </ais-hits>
    </ais-instant-search>
  </div>
</template>

<script lang="ts">
import Vue from "vue";
import firebase from "../firebase";
const db = firebase.firestore();
import { mapState } from "vuex";
import { EditIcon } from "vue-feather-icons";
import algoliasearch from "algoliasearch/lite";
import { SearchClient } from "algoliasearch/lite";
import "instantsearch.css/themes/satellite-min.css";

export default Vue.extend({
  components: {
    EditIcon,
  },
  data() {
    return {
      parentPath: "",
      profile: {} as firebase.firestore.DocumentData,
      searchClient: {} as SearchClient,
      searchClientLoaded: false,
    };
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.setup();
  },
  methods: {
    async setup() {
      this.profile = await db.collection("Profiles").doc(this.user.uid).get();
      const searchkey = this.profile.get("algoliaSearchKey");
      this.searchClient = algoliasearch("F7IPMZB3IW", searchkey);
      this.searchClientLoaded = true;
    },
  },
  computed: {
    ...mapState(["user"]),
  },
});
</script>
