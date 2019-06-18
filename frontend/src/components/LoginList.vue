<template>
  <div id="container">
    <input type="textbox" placeholder="search..." v-model="search" />
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
import moment from "moment";

export default {
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
      return moment(date).fromNow();
    },
    shortDate(date) {
      return moment(date).format("MMM DD");
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
      parentPath: null,
      collection: null, // collection: a reference to the parent collection
      items: []
    };
  },
  created() {
    this.parentPath = this.$route.matched[
      this.$route.matched.length - 1
    ].parent.path;
    this.collection = this.$parent.collection;
    this.items = this.$parent.items;
    this.$bind("items", this.items);
  },
  methods: {
    del(item) {
      this.collection
        .doc(item)
        .delete()
        .catch(err => {
          console.log(err);
        });
    },
    searchString(item) {
      const fields = Object.values(item);
      fields.push(item.id);
      return fields.join(",").toLowerCase();
    }
  }
};
</script>
<style scoped>
.anchorbox {
  width: 7.2em;
}
</style>
