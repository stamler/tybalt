<template>
  <div id="list">
    <div class="listentry" v-for="item in items" v-bind:key="item.id">
      <div class="anchorbox">
        <router-link :to="[parentPath, item.id, 'details'].join('/')">
          {{ item.date.toDate() | shortDate }}
        </router-link>
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">
            {{ item.description }}
          </div>
          <div class="byline">
            {{ item.total }}
          </div>
        </div>
        <div class="firstline"></div>
        <div class="secondline"></div>
        <div class="thirdline"></div>
      </div>
      <div class="rowactionsbox">
        <template v-if="item.submitted === false">
          <router-link to="#" v-on:click.native="del(item, collectionObject)">
            <x-circle-icon></x-circle-icon>
          </router-link>
          <router-link :to="[parentPath, item.id, 'edit'].join('/')">
            <edit-icon></edit-icon>
          </router-link>
          <router-link
            v-bind:to="{ name: 'Expense Entries' }"
            v-on:click.native="submitExpense(item.id)"
          >
            <send-icon></send-icon>
          </router-link>
        </template>
        <template v-else>
          <!-- submitted -->
          <span v-if="item.approved === false" class="label">submitted</span>
          <span v-else class="label">approved</span>
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
import {
  EditIcon,
  SendIcon,
  XCircleIcon
} from "vue-feather-icons";
import store from "../store";
const db = firebase.firestore();

export default Vue.extend({
  mixins: [mixins],
  props: ["approved", "collection"],
  components: {
    EditIcon,
    SendIcon,
    XCircleIcon
  },
  filters: {
    shortDate(date: Date) {
      return format(date, "MMM dd");
    }
  },
  data() {
    return {
      rejectionId: "",
      rejectionReason: "",
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      items: []
    };
  },
  watch: {
    collection: {
      immediate: true,
      handler(collection) {
        this.parentPath =
          this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ??
          "";
        this.collectionObject = db.collection(collection);
        const uid = store.state.user?.uid;
        if (uid === undefined) {
          throw "There is no valid uid";
        }
        this.$bind(
          "items",
          this.collectionObject.where("uid", "==", uid).orderBy("date", "desc")
        ).catch((error) => {
          alert(`Can't load Expense Entries: ${error.message}`);
        });
      }
    }
  },
});
</script>
