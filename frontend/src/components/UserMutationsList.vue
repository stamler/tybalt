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
        <router-link
          v-if="item.userId"
          :to="[parentPath, item.userId, 'details'].join('/')"
        >
          {{ item.givenName }} {{ item.surname }}
        </router-link>
        <span v-else> {{ item.givenName }} {{ item.surname }} </span>
        <span
          v-if="
            item.returnedData &&
            item.returnedData.password &&
            item.returnedData.email
          "
        >
          <action-button
            title="copy password to clipboard"
            type="clipboard"
            @click="
              copyToClipboard(
                `Your username and password are ${item.returnedData.email} ${item.returnedData.password} \nYou now have everything you need to complete the setup of Authenticator per the instructions.`
              )
            "
          />
        </span>
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">{{ item.verb }}</div>
          <div class="byline">{{ item.status }}</div>
        </div>
        <div class="firstline">created by: {{ item.creatorName }}</div>
        <div class="secondline">
          {{ item.created.toDate() }}
        </div>
        <div class="thirdline" v-if="item.data !== undefined">
          {{ item.data.title }}, {{ item.data.department }} //
          {{ item.data.telephoneNumber }} // {{ item.data.remuneration }} //
          defaultDivision:{{ item.data.defaultDivision }} // manager:
          {{ item.data.managerName }} // tbtePayrollId:
          {{ item.data.tbtePayrollId }}
        </div>
      </div>
      <div class="rowactionsbox">
        <action-button
          title="delete the mutation"
          type="delete"
          @click="del(item)"
        />
        <action-button
          @click="approve(item)"
          v-if="item.status === 'unapproved'"
          title="approve the mutation"
          type="approve"
        />
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import store from "../store";
import firebase from "../firebase";
import ActionButton from "./ActionButton.vue";
import { searchString } from "./helpers";
const db = firebase.firestore();

export default Vue.extend({
  components: {
    ActionButton,
  },
  data() {
    return {
      search: "",
      parentPath: "",
      collectionObject: db.collection("UserMutations"),
      items: [],
    };
  },
  methods: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    copyToClipboard(text: string) {
      navigator.clipboard.writeText(text).then(() => {
        alert(`SMS on clipboard`);
      });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    approve(item: any) {
      store.commit("startTask", {
        id: `approvingMutation${item.id}`,
        message: "Approving...",
      });
      const approvingMutation = firebase
        .functions()
        .httpsCallable("approveMutation");
      return (
        approvingMutation({ id: item.id })
          .then(() => {
            store.commit("endTask", { id: `approvingMutation${item.id}` });
          })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .catch((error: any) => {
            store.commit("endTask", { id: `approvingMutation${item.id}` });
            alert(`Error approving mutation: ${error.message}`);
          })
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    del(item: any) {
      store.commit("startTask", {
        id: `deleteMutation${item.id}`,
        message: "Deleting...",
      });
      const deleteMutation = firebase
        .functions()
        .httpsCallable("deleteMutation");
      return deleteMutation({ id: item.id })
        .then(() => {
          store.commit("endTask", { id: `deleteMutation${item.id}` });
        })
        .catch((error) => {
          store.commit("endTask", { id: `deleteMutation${item.id}` });
          alert(`Error deleting mutation: ${error.message}`);
        });
    },
  },
  computed: {
    processedItems(): firebase.firestore.DocumentData[] {
      return this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .filter(
          (p: firebase.firestore.DocumentData) =>
            searchString(p).indexOf(this.search.toLowerCase()) >= 0
        );
    },
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.$bind("items", this.collectionObject);
  },
});
</script>
<style scoped>
.anchorbox {
  flex-basis: 6.8em;
}
</style>
