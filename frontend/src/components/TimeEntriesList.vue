<template>
  <div id="list">
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
      <div class="rowactionsbox">
        <router-link :to="[parentPath, item.id, 'edit'].join('/')">
          <edit-icon></edit-icon>
        </router-link>
        <router-link to="#" v-on:click.native="del(item.id)">
          <x-circle-icon></x-circle-icon>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script>
import { format } from "date-fns";
import { EditIcon, XCircleIcon } from "vue-feather-icons";

export default {
  components: {
    EditIcon,
    XCircleIcon
  },
  filters: {
    shortDate(date) {
      return format(date, "MMM dd");
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
  },
  methods: {
    del(item) {
      this.collection
        .doc(item)
        .delete()
        .catch(err => {
          alert(`Error deleting item: ${err}`);
        });
    }
  }
};
</script>
