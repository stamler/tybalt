<template>
  <div id="list">
    <input
      id="searchbox"
      type="textbox"
      placeholder="search..."
      v-model="search"
    />
    <span class="listheader"> Total Active jobs with no time {{ count }} </span>

    <div class="listentry" v-for="item in processedItems" v-bind:key="item.id">
      <div class="anchorbox">{{ item.id }}</div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">{{ item.client }}</div>
          <div class="byline">{{ item.description }}</div>
        </div>
        <div class="firstline">{{ item.manager }}</div>
        <div class="secondline">{{ item.proposal }}</div>
        <div class="thirdline" v-if="item.clientContact">
          Contact: {{ item.clientContact }}
        </div>
      </div>
      <div class="rowactionsbox">
        <router-link :to="[parentPath, item.id, 'edit'].join('/')">
          <Icon icon="feather:edit" width="24px" />
        </router-link>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { searchString, shortDateWithYear } from "./helpers";
import { useStateStore } from "../stores/state";
import { Icon } from "@iconify/vue";
import { firebaseApp } from "../firebase";
import {
  getCountFromServer,
  getFirestore,
  collection,
  DocumentData,
  query,
  where,
  limit,
  Query,
} from "firebase/firestore";
const db = getFirestore(firebaseApp);
export default defineComponent({
  setup() {
    const stateStore = useStateStore();
    const user = stateStore.user;
    return { user };
  },
  components: {
    Icon,
  },
  methods: {
    shortDateWithYear,
  },
  computed: {
    processedItems(): DocumentData[] {
      // display maximum of 100 items though there may be way more
      // TODO: don't pull more than 50 items from the server at a time
      // scroll to the bottom to load more (infinite scroll)
      // TODO: possibly use full text search like
      // https://www.npmjs.com/package/adv-firestore-functions
      return this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .filter(
          (p: DocumentData) =>
            searchString(p).indexOf(this.search.toLowerCase()) >= 0
        )
        .slice(0, 100);
    },
  },
  data() {
    return {
      count: 0,
      query: undefined as Query | undefined,
      search: "",
      parentPath: "",
      items: [] as DocumentData[],
    };
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
    const rawQuery = query(
      collection(db, "Jobs"),
      where("hasTimeEntries", "==", false)
    );
    this.$firestoreBind("items", query(rawQuery, limit(100)));
    getCountFromServer(rawQuery).then((snap) => {
      this.count = snap.data().count;
    });
  },
});
</script>
