<template>
  <div id="list">
    <input
      id="searchbox"
      type="textbox"
      placeholder="search..."
      v-model="search"
    />
    <div class="listentry" v-for="item in processedItems" v-bind:key="item.id">
      <div class="anchorbox">
        <router-link :to="[parentPath, item.id, 'details'].join('/')">
          {{ item.givenName }} {{ item.surname }}
        </router-link>
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">{{ item.email }}</div>
          <div class="byline">{{ item.updated.toDate() | relativeTime }}</div>
        </div>
        <div class="firstline">
          {{ item.userSourceAnchor }}
        </div>
        <div class="secondline">
          {{ item.upn }} @
          {{ item.lastComputer }}
        </div>
        <div class="thirdline">
          {{
            item.created
              ? "first seen " +
                $options.filters.dateFormat(item.created.toDate())
              : ""
          }}
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import mixins from "./mixins";
import { format, formatDistanceToNow } from "date-fns";
import { mapState } from "vuex";
import firebase from "../firebase";

const db = firebase.firestore();

// TODO: mixins cannot be used in TypeScript in Vue 2 without hacks.
// https://github.com/vuejs/vue/issues/8721
// In this case instead of using Vue.extend() we're extending the mixin.
export default mixins.extend({
  data() {
    return {
      search: "",
      parentPath: "",
      collection: db.collection("Users"),
      items: []
    };
  },
  computed: {
    ...mapState(["claims"]),
    processedItems(): firebase.firestore.DocumentData[] {
      return this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .filter(
          (p: firebase.firestore.DocumentData) =>
            this.searchString(p).indexOf(this.search.toLowerCase()) >= 0
        );
    }
  },
  filters: {
    dateFormat(date: Date) {
      return format(date, "yyyy MMM dd / HH:mm:ss");
    },
    relativeTime(date: Date) {
      return formatDistanceToNow(date, { addSuffix: true });
    }
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.$bind("items", this.collection).catch(error => {
      alert(`Can't load Users: ${error.message}`);
    });
  }
});
</script>
<style scoped>
.anchorbox {
  flex-basis: 6.8em;
}
</style>
