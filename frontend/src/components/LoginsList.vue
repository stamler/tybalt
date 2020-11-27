<template>
  <div id="list">
    <input
      id="searchbox"
      type="textbox"
      placeholder="search..."
      v-model="search"
    />
    <div class="listentry" v-for="item in processedItems" v-bind:key="item.id">
      <div class="anchorbox">{{ item.created.toDate() | relativeTime }}</div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">{{ item.givenName }} {{ item.surname }}</div>
        </div>
        <div class="firstline">{{ item.computer }}</div>
      </div>
    </div>
  </div>
</template>

<script>
import mixins from "./mixins";
import { formatDistanceToNow } from "date-fns";
import firebase from "../firebase";
const db = firebase.firestore();

export default {
  props: ["collection"],
  mixins: [mixins],
  computed: {
    processedItems() {
      return this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .filter(
          p => this.searchString(p).indexOf(this.search.toLowerCase()) >= 0
        );
    }
  },
  filters: {
    relativeTime(date) {
      return formatDistanceToNow(date, { addSuffix: true });
    },
    hoursString(item) {
      const hoursArray = [];
      if (item.hours) hoursArray.push(item.hours + " hrs");
      if (item.jobHours) hoursArray.push(item.jobHours + " job hrs");
      if (item.mealsHours) hoursArray.push(item.mealsHours + " hrs meals");
      return hoursArray.join(" + ");
    }
  },
  data() {
    return {
      search: "",
      parentPath: "",
      collectionObject: null, // collection: a reference to the parent collection
      items: []
    };
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.$bind(
      "items",
      this.collectionObject.orderBy("created", "desc").limit(101)
    ).catch(error => {
      alert(`Can't load Logins: ${error.message}`);
    });
  }
};
</script>
<style scoped>
.anchorbox {
  flex-basis: 7.2em;
}
</style>
