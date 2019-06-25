<template>
  <div id="list">
    <input
      id="searchbox"
      type="textbox"
      placeholder="search..."
      v-model="search"
    />
    <div class="listentry" v-for="item in processedItems" v-bind:key="item.id">
      <div class="anchorbox">{{ item.computerName }}</div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">
            <!-- hide item.mfg if model starts with HP -->
            {{ item.model.startsWith("HP ") ? "" : item.mfg }} {{ item.model }}
          </div>
          <div class="byline">
            <span
              v-if="!item.computerName.includes(item.serial)"
              class="attention"
            >
              ({{ item.serial }})
            </span>
          </div>
        </div>
        <div class="firstline">
          {{ item.updated.toDate() | relativeTime }}, Windows
          {{ item.osVersion }}
        </div>
        <div class="secondline">
          {{ item.userGivenName }} {{ item.userSurname }}
          <span v-if="!item.assigned">
            <!-- Show this if the device has no assignment -->
            <button
              v-if="claims.computers === true"
              v-on:click="assign(item.id, item.userSourceAnchor)"
              class="attention"
            >
              assign
            </button>
          </span>
          <span
            v-else-if="item.assigned.userSourceAnchor !== item.userSourceAnchor"
          >
            <!-- Show this if the device has an assignment that doesn't
            match the last user login-->
            <button
              v-on:click="assign(item.id, item.userSourceAnchor)"
              class="attention"
            >
              assign, currently {{ item.assigned.givenName }}
              {{ item.assigned.surname }}
            </button>
          </span>
          <span v-else>
            assigned {{ item.assigned.time.toDate() | relativeTime }}
          </span>
        </div>
        <div class="thirdline">
          first seen {{ item.created.toDate() | dateFormat }}
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import moment from "moment";
import { mapState } from "vuex";

export default {
  computed: {
    ...mapState(["claims"]),
    processedItems() {
      return this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .filter(
          p => this.searchString(p).indexOf(this.search.toLowerCase()) >= 0
        );
    }
  },
  filters: {
    dateFormat(date) {
      return moment(date).format("YYYY MMM DD / HH:mm:ss");
    },
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
  width: 6.5em;
}
</style>
