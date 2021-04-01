<template>
  <div id="list">
    <div class="listentry" v-for="item in items" v-bind:key="item.id">
      <div class="anchorbox">
        <router-link :to="[parentPath, item.id, 'details'].join('/')">
          {{ item.weekEnding.toDate() | exportDate }}
        </router-link>
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline"></div>
          <div class="byline"></div>
        </div>
        <div class="firstline">
          {{ Object.keys(item.expenses).length }} expense(s)
        </div>
        <div class="secondline"></div>
      </div>
      <div class="rowactionsbox">
        <a v-if="hasLink(item, 'zip')" download v-bind:href="item['zip']">
          attachments.zip<download-icon></download-icon>
        </a>
        <a v-if="hasLink(item, 'json')" download v-bind:href="item['json']">
          .json<download-icon></download-icon>
        </a>
        <router-link
          v-if="hasLink(item, 'json')"
          v-bind:to="{ name: 'Expense Tracking' }"
          v-on:click.native="generatePayablesCSV(item['json'])"
        >
          payables<download-icon></download-icon>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import firebase from "../firebase";
import mixins from "./mixins";
import { format } from "date-fns";
import { DownloadIcon, RefreshCwIcon } from "vue-feather-icons";

const db = firebase.firestore();

export default mixins.extend({
  props: ["collection"],
  components: { DownloadIcon, RefreshCwIcon },
  filters: {
    exportDate(date: Date) {
      return format(date, "yyyy MMM dd");
    },
  },
  data() {
    return {
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      items: [],
    };
  },
  methods: {
    hasLink(item: firebase.firestore.DocumentData, property: string) {
      return (
        Object.prototype.hasOwnProperty.call(item, property) &&
        item[property].length > 32
      );
    },
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.$bind(
      "items",
      this.collectionObject.orderBy("weekEnding", "desc")
    ).catch((error) => {
      alert(`Can't load ExpenseTracking: ${error.message}`);
    });
  },
});
</script>
