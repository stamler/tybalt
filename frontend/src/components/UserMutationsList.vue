<template>
  <div id="list">
    <div id="listbar">
      <input
        id="searchbox"
        type="textbox"
        placeholder="search..."
        v-model="search"
      />
      <span>{{ items.length }} items</span>
    </div>
    <div v-for="[status, mutations] in processedItems" v-bind:key="status">
      <span class="listheader">{{ status }}</span>
      <div class="listentry" v-for="item in mutations" v-bind:key="item.id">
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
            updated: {{ dateFormat(item.statusUpdated.toDate()) }}
          </div>
          <div class="thirdline" v-if="item.data !== undefined">
            {{ item.data.title }}, {{ item.data.department }} //
            {{ item.data.telephoneNumber }} // {{ item.data.remuneration }} //
            defaultDivision:{{ item.data.defaultDivision }} // manager:
            {{ item.data.managerName }} // payrollId:
            {{ item.data.payrollId }} // defaultChargeOutRate:
            {{ item.data.defaultChargeOutRate }}
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
  </div>
</template>
<script lang="ts">
import { defineComponent } from "vue";
import { useStateStore } from "../stores/state";
import { useCollection } from "vuefire";
import { firebaseApp } from "../firebase";
import _ from "lodash";
import {
  query,
  getFirestore,
  collection,
  DocumentData,
  orderBy,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import ActionButton from "./ActionButton.vue";
import { searchString, dateFormat } from "./helpers";
const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp);

export default defineComponent({
  setup() {
    const store = useStateStore();
    const { startTask, endTask } = store;
    return { startTask, endTask };
  },
  components: {
    ActionButton,
  },
  data() {
    return {
      search: "",
      parentPath: "",
      items: useCollection(
        query(collection(db, "UserMutations"), orderBy("statusUpdated", "desc"))
      ),
    };
  },
  methods: {
    dateFormat,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    copyToClipboard(text: string) {
      navigator.clipboard.writeText(text).then(() => {
        alert(`SMS on clipboard`);
      });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    approve(item: any) {
      this.startTask({
        id: `approvingMutation${item.id}`,
        message: "Approving...",
      });
      const approvingMutation = httpsCallable(functions, "approveMutation");
      return (
        approvingMutation({ id: item.id })
          .then(() => {
            this.endTask(`approvingMutation${item.id}`);
          })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .catch((error: any) => {
            this.endTask(`approvingMutation${item.id}`);
            alert(`Error approving mutation: ${error.message}`);
          })
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    del(item: any) {
      this.startTask({
        id: `deleteMutation${item.id}`,
        message: "Deleting...",
      });
      const deleteMutation = httpsCallable(functions, "deleteMutation");
      return deleteMutation({ id: item.id })
        .then(() => {
          this.endTask(`deleteMutation${item.id}`);
        })
        .catch((error) => {
          this.endTask(`deleteMutation${item.id}`);
          alert(`Error deleting mutation: ${error.message}`);
        });
    },
  },
  computed: {
    processedItems(): Map<string, DocumentData[]> {
      // First keep only the items matching the search term
      const filteredItems = this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .filter(
          (p: DocumentData) =>
            searchString(p).indexOf(this.search.toLowerCase()) >= 0
        );

      // Then group the items by status complete or not using the groupBy
      // function from lodash
      const grouped = _.groupBy(filteredItems, (p: DocumentData) => p.status);

      // Finally convert the grouped object to a map so we can choose the order
      // of the keys in the UI
      const map = new Map(Object.entries(grouped));

      // Then place complete items at the end of the map
      const completeItems = map.get("complete");
      if (completeItems) {
        map.delete("complete");
        map.set("complete", completeItems);
      }
      return map;
    },
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
  },
});
</script>
<style scoped>
.anchorbox {
  flex-basis: 6.8em;
}
</style>
