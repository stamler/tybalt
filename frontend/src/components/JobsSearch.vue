<template>
  <div id="list" v-if="searchClientLoaded">
    <ais-instant-search
      v-bind:search-client="searchClient"
      index-name="tybalt_jobs"
    >
      <ais-search-box id="searchbox" placeholder="search..." />
      <ais-hits>
        <div class="listentry" slot="item" slot-scope="{ item }">
          <div class="anchorbox">
            <router-link :to="[parentPath, item.objectID, 'details'].join('/')">
              {{ item.objectID }}
            </router-link>
          </div>
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
            <router-link :to="[parentPath, item.objectID, 'edit'].join('/')">
              <edit-icon></edit-icon>
            </router-link>
          </div>
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

export default Vue.extend({
  components: {
    EditIcon,
  },
  data() {
    return {
      parentPath: "",
      profileSecrets: {} as firebase.firestore.DocumentData,
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
      this.profileSecrets = await db
        .collection("ProfileSecrets")
        .doc(this.user.uid)
        .get();
      const searchkey = this.profileSecrets.get("algoliaSearchKey");
      this.searchClient = algoliasearch("F7IPMZB3IW", searchkey);
      this.searchClientLoaded = true;
    },
  },
  computed: {
    ...mapState(["user"]),
  },
});
</script>
<style>
.ais-Hits-list {
  list-style: none;
}
.ais-SearchBox-form {
  display: flex;
}
.ais-SearchBox-input {
  flex: 1;
  border: none;
  order: 2;
}
.ais-SearchBox-submit {
  order: 1;
}
button.ais-SearchBox-submit {
  display: none;
  background: none;
}
.ais-SearchBox-reset {
  order: 3;
}
.anchorbox {
  flex-basis: 6em;
}
</style>
