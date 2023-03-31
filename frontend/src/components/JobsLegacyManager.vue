<template>
  <div id="list">
    <span class="listheader">
      *TEMPORARY during migration* Total jobs with legacy manager: {{ count }}
    </span>

    <div class="listentry" v-for="item in processedItems" v-bind:key="item.id">
      <div class="anchorbox">
        <router-link :to="[parentPath, item.id, 'details'].join('/')">
          {{ item.id }}
        </router-link>
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">{{ item.client }}</div>
          <div class="byline">{{ item.description }}</div>
        </div>
        <div class="firstline">{{ item.manager }}</div>
        <div class="secondline">{{ item.proposal }}</div>
        <div v-if="item.clientContact" class="thirdline">
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
import { useStateStore } from "../stores/state";
import { Icon } from "@iconify/vue";
import { useCollection } from "vuefire";
import { firebaseApp } from "../firebase";
import {
  getCountFromServer,
  DocumentData,
  getFirestore,
  collection,
  query,
  limit,
  orderBy,
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
  data() {
    return {
      count: 0,
      query: query(collection(db, "Jobs"), orderBy("manager")),
      parentPath: "",
      items: useCollection(
        query(query(collection(db, "Jobs"), orderBy("manager")), limit(2000))
      ),
    };
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
    getCountFromServer(this.query).then((snap) => {
      this.count = snap.data().count;
    });
  },
  computed: {
    processedItems(): DocumentData[] {
      return this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .filter(
          // filter out items where managerUid is present
          (p: DocumentData) =>
            !Object.prototype.hasOwnProperty.call(p, "managerUid")
        );
    },
  },
});
</script>
