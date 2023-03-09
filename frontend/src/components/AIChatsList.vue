<!-- This vue component renders the list of previous AI Chats based on title and
last_updated. Clicking on a chat will open the chat in the AIChat component. An
AIChat is a firestore document that contains a uid, title, last_updated, and an
subcollection of messages. The messages are in the ChatML format. The List is
rendered using in the same way as other lists in the application. The list is
rendered using a root div wrapping a single div with the list id. Inside the
list div, we have a div with id listbar and a second div with id listentry which
is repeated with the v-for directive for each item in the list. The listbar div
contains the input with the searchbox id used for filtering the list and a span
wrapping the number of items in the list. The listentry div contains an
anchorbox div with a last_updated in the shortDate format. It also contains a
detailsbox div that wraps the title and a span with the number of messages in
the chat. The final div in the listentry div is a rowactionbox div that contains
a button with a right arrow icon that takes the user to the AIChat component for
the selected chat.
-->
<template>
  <div>
    <div id="list">
      <div id="listbar">
        <input
          id="searchbox"
          type="text"
          placeholder="search..."
          v-model="search"
        />
        <span>{{ processedItems.length }} items</span>
      </div>
      <div class="listentry" v-for="item in processedItems" :key="item.id">
        <div class="anchorbox">
          <span>{{ shortDate(item.last_updated.toDate()) }}</span>
        </div>
        <div class="detailsbox">
          <div class="firstline">{{ item.title }}</div>
          <div class="secondline">
            {{ item.count }}
          </div>
        </div>
        <div class="rowactionbox">
          <action-button
            v-if="!(`deleteChat${item.id}` in activeTasks)"
            type="delete"
            @click="delChat(item)"
          />
          <router-link :to="[parentPath, item.id, 'chat'].join('/')">
            <Icon icon="feather:chevron-right" width="24px" />
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { User } from "firebase/auth";
import { defineComponent } from "vue";
import { Icon } from "@iconify/vue";
import ActionButton from "./ActionButton.vue";
import { useStateStore } from "../stores/state";
import { firebaseApp } from "../firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useCollection } from "vuefire";
import {
  collection,
  getFirestore,
  DocumentData,
  query,
  where,
} from "firebase/firestore";
import { searchString, shortDate } from "./helpers";

const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp);
export default defineComponent({
  components: { ActionButton, Icon },
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
  name: "AIChatList",
  data() {
    return {
      search: "",
      parentPath: "",
      collectionObject: collection(db, "AIChats"),
      items: useCollection(
        query(
          collection(db, "AIChats"),
          where("uid", "==", (this.user as unknown as User).uid)
        )
      ),
    };
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
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
  },
  methods: {
    async delChat(item: DocumentData) {
      // implement delete chat functionality by calling the deleteChat
      // HttpsCallable function in the backend from ai.ts
      const deleteChat = httpsCallable(functions, "deleteChat");
      this.startTask({
        id: `deleteChat${item.id}`,
        message: "deleting...",
      });
      try {
        await deleteChat({ id: item.id });
        this.endTask(`deleteChat${item.id}`);
      } catch (error: unknown) {
        this.endTask(`deleteChat${item.id}`);
        if (error instanceof Error) {
          alert(`Error deleting chat: ${error.message}`);
        } else alert(`Error deleting chat: ${JSON.stringify(error)}`);
      }
    },
    shortDate,
  },
});
</script>
