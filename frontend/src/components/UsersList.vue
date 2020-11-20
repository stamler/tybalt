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
import Vue from "vue";
import { format, formatDistanceToNow } from "date-fns";
import { mapState } from "vuex";
import firebase from "../firebase";

const db = firebase.firestore();

export default Vue.extend({
  data() {
    return {
      search: "",
      parentPath: null as string | null,
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
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ??
      null;
    this.$bind("items", this.collection).catch(error => {
      alert(`Can't load Users: ${error.message}`);
    });
  },
  methods: {
    searchString(item: firebase.firestore.DocumentData) {
      const fields = Object.values(item);
      fields.push(item.id);
      return fields.join(",").toLowerCase();
    }
  }
});
</script>
<style scoped>
.anchorbox {
  flex-basis: 6.8em;
}
</style>
