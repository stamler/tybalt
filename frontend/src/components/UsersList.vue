<template>
  <div id="list">
    <div id="listbar">
      <input
        id="searchbox"
        type="textbox"
        placeholder="search..."
        v-model="search"
      />
      <span>{{ processedItems.length }} items</span>
    </div>
    <div class="listentry" v-for="item in processedItems" v-bind:key="item.id">
      <div class="anchorbox">
        <router-link :to="[parentPath, item.id, 'details'].join('/')">
          {{ item.givenName }} {{ item.surname }}
        </router-link>
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">{{ item.email }}</div>
          <div class="byline">
            <span v-if="item.updated">
              {{ item.updated.toDate() | relativeTime }}
            </span>
            <span v-if="item.addedWithoutComputerLogin">
              no logins, added
              {{ item.addedWithoutComputerLogin.toDate() | relativeTime }}
            </span>
          </div>
        </div>
        <div class="firstline">
          {{ item.userSourceAnchor }}
        </div>
        <div class="secondline">
          {{ item.upn }} @
          {{ item.lastComputer }}
        </div>
        <div class="thirdline">
          {{
            item.created
              ? "first seen " +
                $options.filters.dateFormat(item.created.toDate())
              : ""
          }}
        </div>
      </div>
      <div class="rowactionsbox" v-if="item.isInOnPremisesAD === true">
        <template v-if="item.OU === 'Human Users'">
          <router-link
            v-bind:to="{ name: 'Edit Employee' }"
            title="Edit the user"
          >
            <edit-icon></edit-icon>
          </router-link>
          <router-link
            to="#"
            v-on:click.native="moveToDisabledOU(item.id)"
            title="Disable and archive the user"
          >
            <archive-icon></archive-icon>
          </router-link>
          <router-link
            to="#"
            v-on:click.native="deleteAccount(item.id)"
            title="Delete the user"
          >
            <x-circle-icon></x-circle-icon>
          </router-link>
          <router-link
            to="#"
            v-on:click.native="resetPassword(item.id)"
            title="Reset the user's password and unlock if necessary"
          >
            <key-icon></key-icon>
          </router-link>
          <router-link
            to="#"
            v-on:click.native="disableLogin(item.id)"
            title="Disable the user"
          >
            <lock-icon></lock-icon>
          </router-link>
        </template>
        <template v-if="item.OU === 'Disabled Users'">Disabled</template>
        <div
          style="width: 13em"
          v-if="item.OU === 'DisabledUsersSharedMailbox'"
        >
          Disabled w/Shared Mailbox
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import mixins from "./mixins";
import {
  XCircleIcon,
  EditIcon,
  ArchiveIcon,
  KeyIcon,
  LockIcon,
} from "vue-feather-icons";
import { format, formatDistanceToNow } from "date-fns";
import { mapState } from "vuex";
import firebase from "../firebase";

const db = firebase.firestore();

// TODO: mixins cannot be used in TypeScript in Vue 2 without hacks.
// https://github.com/vuejs/vue/issues/8721
// In this case instead of using Vue.extend() we're extending the mixin.
export default mixins.extend({
  props: ["query"],
  components: {
    XCircleIcon,
    EditIcon,
    ArchiveIcon,
    KeyIcon,
    LockIcon,
  },
  data() {
    return {
      search: "",
      parentPath: "",
      collectionObject: db.collection("Users"),
      items: [],
    };
  },
  computed: {
    ...mapState(["claims"]),
    processedItems(): firebase.firestore.DocumentData[] {
      return this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .filter(
          (p: firebase.firestore.DocumentData) =>
            this.searchString(p).indexOf(this.search.toLowerCase()) >= 0
        );
    },
  },
  filters: {
    dateFormat(date: Date) {
      return format(date, "yyyy MMM dd / HH:mm:ss");
    },
    relativeTime(date: Date) {
      return formatDistanceToNow(date, { addSuffix: true });
    },
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.$watch(
      "query",
      () => {
        if (this.query === "list") {
          // show all users
          this.$bind("items", this.collectionObject).catch((error) => {
            alert(`Can't load Users: ${error.message}`);
          });
        } else if (this.query === "ad") {
          // show users that exist in active directory
          this.$bind(
            "items",
            this.collectionObject
              .where("isInOnPremisesAD", "==", true)
              .orderBy("surname", "asc")
              .orderBy("givenName", "asc")
          ).catch((error) => {
            alert(`Can't load Users: ${error.message}`);
          });
        } else if (this.query === "noad") {
          // show users that do not exist in active directory
          this.$bind(
            "items",
            this.collectionObject
              .where("isInOnPremisesAD", "==", false)
              .orderBy("surname", "asc")
              .orderBy("givenName", "asc")
          ).catch((error) => {
            alert(`Can't load Users: ${error.message}`);
          });
        }
      },
      { immediate: true }
    );
  },
});
</script>
<style scoped>
.anchorbox {
  flex-basis: 6.8em;
}
</style>
