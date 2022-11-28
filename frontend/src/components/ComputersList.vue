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
                ### Retired {{ shortDate(item.retired.toDate()) }} ##
              </span>
            </div>
          </div>
          <div class="firstline">
            {{ relativeTime(item.updated.toDate()) }}, Windows
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
                assigned {{ relativeTime(item.assigned.time.toDate()) }}
              </span>
            </span>
          </div>
          <div class="thirdline">
            first seen {{ dateFormat(item.created.toDate()) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  collection,
  CollectionReference,
  DocumentData,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { format, formatDistanceToNow } from "date-fns";
import { useStateStore } from "../stores/state";
import { toRef } from "vue";
import { dateFormat, searchString } from "./helpers";
const db = getFirestore(firebaseApp);

export default defineComponent({
  setup: function () {
    const store = useStateStore();
    return { claims: toRef(store, "claims") };
  },
  props: ["retired", "collectionName"],
  computed: {
    processedItems(): DocumentData[] {
      if (this.retired) {
        return this.items
          .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
          .filter((p: DocumentData) =>
            Object.prototype.hasOwnProperty.call(p, "retired")
          )
          .filter(
            (p: DocumentData) =>
              searchString(p).indexOf(this.search.toLowerCase()) >= 0
          );
      } else {
        return this.items
          .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
          .filter(
            (p: DocumentData) =>
              !Object.prototype.hasOwnProperty.call(p, "retired")
          )
          .filter(
            (p: DocumentData) =>
              searchString(p).indexOf(this.search.toLowerCase()) >= 0
          );
      }
    },
  },
  data() {
    return {
      search: "",
      parentPath: "",
      collectionObject: null as CollectionReference | null,
      items: [] as DocumentData[],
    };
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
    this.collectionObject = collection(db, this.collectionName);
    this.$firestoreBind("items", this.collectionObject).catch(
      (error: unknown) => {
        if (error instanceof Error)
          alert(`Can't load computers: ${error.message}`);
        else alert(`Can't load computers: ${JSON.stringify(error)}`);
      }
    );
  },
  methods: {
    assign(computerId: string, userSourceAnchor: string) {
      const functions = getFunctions(firebaseApp);
      const assignComputerToUser = httpsCallable(
        functions,
        "assignComputerToUser"
      );
      return assignComputerToUser({ computerId, userSourceAnchor }).catch(
        (error) => {
          alert(`Computer assignment failed: ${error}`);
        }
      );
    },
    relativeTime(date: Date): string {
      return formatDistanceToNow(date, { addSuffix: true });
    },
    shortDate(date: Date): string {
      return format(date, "MMM dd");
    },
    dateFormat,
  },
});
</script>
<style scoped>
.anchorbox {
  flex-basis: 6.5em;
}
</style>
