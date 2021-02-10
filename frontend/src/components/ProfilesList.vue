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
        <div class="secondline">Manager: {{ item.managerName }}</div>
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

<script lang="ts">
import mixins from "./mixins";
import firebase from "../firebase";
const db = firebase.firestore();
import { mapState } from "vuex";
import { EditIcon } from "vue-feather-icons";

export default mixins.extend({
  props: ["collection"],
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
  filters: {
    keysString(obj: { [key: string]: unknown }): string {
      return obj ? Object.keys(obj).join(", ") : "";
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
    this.$bind("items", this.collectionObject).catch((error) => {
      alert(`Can't load Profiles: ${error.message}`);
    });
  },
});
</script>
<style scoped>
.anchorbox {
  flex-basis: 6.8em;
}
</style>
