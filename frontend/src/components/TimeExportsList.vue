<template>
  <div id="list">
    <div class="listentry" v-for="item in items" v-bind:key="item.id">
      <div class="anchorbox">
        {{ item.weekEnding.toDate() | shortDate }}
        <router-link :to="[parentPath, item.id, 'details'].join('/')">
        </router-link>
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline"></div>
          <div class="byline"></div>
        </div>
        <div class="firstline"></div>
        <div class="secondline"></div>
        <div class="thirdline"></div>
      </div>
      <div class="rowactionsbox">
        <refresh-cw-icon></refresh-cw-icon>
        <download-icon></download-icon>
      </div>
    </div>
  </div>
</template>

<script>
import { format } from "date-fns";
import { RefreshCwIcon, DownloadIcon} from "vue-feather-icons";
import firebase from "@/firebase";
import store from "../store";
const db = firebase.firestore();

export default {
  components: {
    RefreshCwIcon,
    DownloadIcon
  },
  filters: {
    shortDate(date) {
      return format(date, "MMM dd");
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
    this.$bind("items", this.collection).catch(error => {
      alert(`Can't load TimeExports: ${error.message}`);
    });
  }
};
</script>
