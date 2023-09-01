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
      <div class="anchorbox">{{ relativeTime(item.start) }}</div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">{{ item.name }}</div>
        </div>
        <div class="firstline">{{ item.description }}</div>
        <div class="secondline">
          {{ shortDateWithWeekday(item.start.toDate()) }} 
          to
          {{ shortDateWithWeekday(item.end.toDate()) }}
        </div>
        <div class="thirdline">{{ item.availability }}</div>
      </div>
      <div class="rowactionsbox">
        <action-button type="delete" @click="delVacation(item)" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { User } from "firebase/auth";
import { useCollection } from "vuefire";
import { defineComponent } from "vue";
import {
  searchString,
  shortDateWithWeekday,
  relativeTime,
  del,
} from "./helpers";
import { subWeeks } from "date-fns";
import { useStateStore } from "../stores/state";
import ActionButton from "./ActionButton.vue";
import { firebaseApp } from "../firebase";
import {
  query,
  where,
  orderBy,
  getFirestore,
  collection,
  DocumentData,
} from "firebase/firestore";
const db = getFirestore(firebaseApp);

export default defineComponent({
  setup() {
    const store = useStateStore();
    const { startTask, endTask } = store;
    return {
      user: store.user,
      startTask,
      endTask,
      activeTasks: store.activeTasks,
    };
  },
  components: {
    ActionButton,
  },
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
    shortDateWithWeekday,
    relativeTime,
    delVacation(item: DocumentData) {
      del(item, collection(db, "Vacations"));
    },
  },
  data() {
    return {
      search: "",
      parentPath: "",
      items: useCollection(
        query(
          collection(db, "Vacations"),
          where("uid", "==", (this.user as unknown as User).uid),
          where("end", ">", subWeeks(new Date(), 8)),
          orderBy("end", "desc")
        )
      ),
    };
  },
});
</script>
