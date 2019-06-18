<template>
  <div id="container">
    <div class="listentry" v-for="item in items" v-bind:key="item.id">
      <div class="anchorbox">{{ item.date.toDate() | shortDate }}</div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">
            {{ item.timetype === "R" ? item.divisionName : item.timetypeName }}
          </div>
          <div class="byline"></div>
        </div>
        <div v-if="item.timetype === 'R' && item.project" class="firstline">
          {{ item.project }} - {{ item.projectName }}
        </div>
        <div class="secondline">
          {{ item | hoursString }}
        </div>
        <div v-if="item.notes" class="thirdline">
          {{ item.notes }}
        </div>
      </div>
      <router-link :to="[parentPath, item.id, 'edit'].join('/')">
        ✏️
      </router-link>
      <router-link to="#" v-on:click.native="del(item.id)">
        ❌
      </router-link>
    </div>
  </div>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import moment from "moment";

export default {
  filters: {
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
      parentPath: null,
      schema: null, // schema: a reference to the parent schema
      collection: null, // collection: a reference to the parent collection
      taskAreaMode: "default",
      items: [],
      search: "",
      sortBy: "created",
      sortDescending: true,
      selectAll: false,
      selected: []
    };
  },
  created() {
    this.parentPath = this.$route.matched[
      this.$route.matched.length - 1
    ].parent.path;
    this.schema = this.$parent.schema;
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
    }
  }
};
</script>
<style>
.listentry {
  display: flex;
  flex-grow: 1;
  font-size: 0.8em;
  height: 5em;
  border-bottom: 1px solid #eee;
}
.anchorbox {
  display: flex;
  flex-shrink: 0;
  margin: 0em 0.6em 0em;
  width: 3.2em;
  align-items: center;
  font-weight: bold;
  font-size: 0.9em;
}
.detailsbox {
  display: flex;
  /* ensure ellipsis works on children 
  https://css-tricks.com/flexbox-truncated-text/ */
  min-width: 0;
  justify-content: center;
  flex-grow: 1;
  flex-direction: column;
}

.headline_wrapper {
  display: flex;
}

.headline,
.byline,
.firstline,
.secondline,
.thirdline {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.9em;
  margin: 0em;
  padding: 0em;
}

.headline {
  font-weight: bold;
}

.byline {
  margin-left: 0.3em;
}

.thirdline {
  color: grey;
}
</style>
