<template>
  <div>
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
      <div
        class="listentry"
        v-for="item in processedItems"
        v-bind:key="item.id"
      >
        <div class="anchorbox">
          <router-link :to="[parentPath, item.id, 'details'].join('/')">
            {{ item.computerName }}
          </router-link>
        </div>
        <div class="detailsbox">
          <div class="headline_wrapper">
            <div class="headline">
              <!-- hide item.mfg if model starts with HP -->
              {{ item.model.startsWith("HP ") ? "" : item.mfg }}
              {{ item.model }}
            </div>
            <div class="byline">
              <span
                v-if="!item.computerName.includes(item.serial)"
                class="attention"
              >
                ({{ item.serial }})
              </span>
              <span v-if="item.retired">
                ### Retired {{ item.retired.toDate() | shortDate }} ##
              </span>
            </div>
          </div>
          <div class="firstline">
            {{ item.updated.toDate() | relativeTime }}, Windows
            {{ item.osVersion }}
          </div>
          <div class="secondline">
            {{ item.userGivenName }} {{ item.userSurname }}
            <span v-if="!item.retired">
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
                v-else-if="
                  item.assigned.userSourceAnchor !== item.userSourceAnchor
                "
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
            </span>
          </div>
          <div class="thirdline">
            first seen {{ item.created.toDate() | dateFormat }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import mixins from "./mixins";
import firebase from "../firebase";
import { format, formatDistanceToNow } from "date-fns";
import { mapState } from "vuex";
const db = firebase.firestore();

export default mixins.extend({
  props: ["retired", "collection"],
  computed: {
    ...mapState(["claims"]),
    processedItems(): firebase.firestore.DocumentData[] {
      if (this.retired) {
        return this.items
          .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
          .filter(p => Object.prototype.hasOwnProperty.call(p, "retired"))
          .filter(
            p => this.searchString(p).indexOf(this.search.toLowerCase()) >= 0
          );
      } else {
        return this.items
          .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
          .filter(p => !Object.prototype.hasOwnProperty.call(p, "retired"))
          .filter(
            p => this.searchString(p).indexOf(this.search.toLowerCase()) >= 0
          );
      }
    }
  },
  filters: {
    dateFormat(date: Date): string {
      return format(date, "yyyy MMM dd / HH:mm:ss");
    },
    relativeTime(date: Date): string {
      return formatDistanceToNow(date, { addSuffix: true });
    },
    shortDate(date: Date): string {
      return format(date, "MMM dd");
    }
  },
  data() {
    return {
      search: "",
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      items: [] as firebase.firestore.DocumentData[]
    };
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.$bind("items", this.collectionObject).catch(error => {
      alert(`Can't load computers: ${error.message}`);
    });
  },
  methods: {
    assign(computerId: string, userId: string) {
      const assignComputerToUser = firebase
        .functions()
        .httpsCallable("assignComputerToUser");
      return assignComputerToUser({ computerId, userId }).catch(error => {
        alert(`Computer assignment failed: ${error}`);
      });
    }
  }
});
</script>
<style scoped>
.anchorbox {
  flex-basis: 6.5em;
}
</style>
