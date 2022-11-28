<template>
  <div id="list">
    <input
      id="searchbox"
      type="textbox"
      placeholder="search..."
      v-model="search"
    />
    <div class="listentry" v-for="item in processedItems" v-bind:key="item.id">
      <div class="anchorbox">{{ relativeTime(item.created.toDate()) }}</div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">{{ item.givenName }} {{ item.surname }}</div>
        </div>
        <div class="firstline">{{ item.computer }}</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { searchString } from "./helpers";
import { formatDistanceToNow } from "date-fns";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  collection,
  CollectionReference,
  DocumentData,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
const db = getFirestore(firebaseApp);

export default defineComponent({
  props: ["collectionName"],
  computed: {
    processedItems(): DocumentData[] {
      return this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .filter(
          (p: DocumentData) =>
            searchString(p).indexOf(this.search.toLowerCase()) >= 0
        );
    },
  },
  methods: {
    relativeTime(date: Date): string {
      return formatDistanceToNow(date, { addSuffix: true });
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
    this.$firestoreBind(
      "items",
      query(this.collectionObject, orderBy("created", "desc"), limit(101))
    ).catch((error: unknown) => {
      if (error instanceof Error) {
        alert(`Can't load Logins: ${error.message}`);
      } else alert(`Can't load Logins: ${JSON.stringify(error)}`);
    });
  },
});
</script>
<style scoped>
.anchorbox {
  flex-basis: 7.2em;
}
</style>
