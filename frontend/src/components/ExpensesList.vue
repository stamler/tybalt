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
        <template v-if="approved === undefined">
          <template v-if="!item.submitted">
            <router-link
              v-bind:to="{ name: 'Time Entries' }"
              v-on:click.native="unbundle(item.id)"
            >
              <edit-icon></edit-icon>
            </router-link>
            <router-link
              v-if="!item.rejected"
              v-bind:to="{ name: 'Time Sheets' }"
              v-on:click.native="submitTs(item.id)"
            >
              <send-icon></send-icon>
            </router-link>
          </template>
          <template v-else-if="!item.approved">
            <router-link
              v-if="!item.approved"
              v-bind:to="{ name: 'Time Sheets' }"
              v-on:click.native="recallTs(item.id)"
            >
              <rewind-icon></rewind-icon>
            </router-link>
            <span class="label">submitted</span>
          </template>
          <template v-else>
            <span class="label">approved</span>
          </template>
        </template>
        <!-- The template for "pending" -->
        <template v-if="approved === false">
          <template v-if="!item.approved && !item.rejected">
            <router-link
              v-if="!item.rejected"
              v-bind:to="{ name: 'Time Sheets Pending' }"
              v-on:click.native="approveTs(item.id)"
            >
              <check-circle-icon></check-circle-icon>
            </router-link>
            <router-link
              v-bind:to="{ name: 'Time Sheets Pending' }"
              v-on:click.native="openRejectModal(item.id)"
            >
              <x-circle-icon></x-circle-icon>
            </router-link>
          </template>
          <template v-if="item.rejected">
            <span class="label">rejected</span>
          </template>
        </template>

        <!-- The template for "approved" -->
        <template v-if="approved === true">
          <template v-if="!item.locked">
            <router-link
              v-bind:to="{ name: 'Time Sheets Pending' }"
              v-on:click.native="openRejectModal(item.id)"
            >
              <x-circle-icon></x-circle-icon>
            </router-link>
          </template>
        </template>
        <template v-if="item.locked === true">
          <span class="label">locked</span>
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
  RewindIcon,
  CheckCircleIcon,
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
    RewindIcon,
    CheckCircleIcon,
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
