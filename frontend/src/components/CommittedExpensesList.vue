<template>
  <div id="list">
    <div class="listentry" v-for="item in items" v-bind:key="item.id">
      <div class="anchorbox">
        {{ item.date.toDate() | shortDate }}
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">
            {{ item.displayName }}
          </div>
          <div class="byline">
            ${{ item.total }}
            <span v-if="item.po"> PO#{{ item.po }}</span>
          </div>
        </div>
        <div class="firstline">
          {{ item.description }}
        </div>
        <div class="secondline">
          <template v-if="item.job !== undefined">
            {{ item.job }} {{ item.jobDescription }} for {{ item.client }}
          </template>
          <template v-if="item.attachment">
            <router-link to="#" v-on:click.native="downloadAttachment(item)">
              <download-icon></download-icon>
            </router-link>
          </template>
        </div>
      </div>
      <div class="rowactionsbox">
        <template v-if="item.committed">
          <span class="label">committed</span>
        </template>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from "vue";
import firebase from "../firebase";
import mixins from "./mixins";
import { format } from "date-fns";
import { DownloadIcon } from "vue-feather-icons";
import store from "../store";
const db = firebase.firestore();

export default Vue.extend({
  mixins: [mixins],
  props: ["collection"],
  components: { DownloadIcon },
  filters: {
    shortDate(date: Date) {
      return format(date, "MMM dd");
    },
  },
  data() {
    return {
      rejectionId: "",
      rejectionReason: "",
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      items: [],
    };
  },
  methods: {
    commitItem(
      item: firebase.firestore.DocumentData,
      collection: firebase.firestore.CollectionReference
    ) {
      if (collection === null) {
        throw "There is no valid collection object";
      }
      collection
        .doc(item.id)
        .update({
          committed: true,
          commitTime: firebase.firestore.FieldValue.serverTimestamp(),
          commitUid: store.state.user?.uid,
          commitName: store.state.user?.displayName,
        })
        .catch((err) => {
          alert(`Error committing item: ${err}`);
        });
    },
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.$bind(
      "items",
      this.collectionObject
        .where("committed", "==", true)
        .orderBy("date", "desc")
    ).catch((error) => {
      alert(`Can't load Expenses: ${error.message}`);
    });
  },
});
</script>
