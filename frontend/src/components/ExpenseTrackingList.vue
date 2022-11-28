<template>
  <div id="list">
    <div class="listentry" v-for="item in items" v-bind:key="item.id">
      <div class="anchorbox">
        <router-link :to="[parentPath, item.id, 'details'].join('/')">
          {{ exportDate(item.weekEnding.toDate()) }}
        </router-link>
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline"></div>
          <div class="byline"></div>
        </div>
        <div class="firstline">
          {{ Object.keys(item.expenses).length }} expense(s)
        </div>
        <div class="secondline"></div>
      </div>
      <div class="rowactionsbox">
        <a v-if="hasLink(item, 'zip')" download v-bind:href="item['zip']">
          attachments.zip<download-icon />
        </a>
        <action-button
          v-if="canRefresh"
          type="refresh"
          @click="generateAttachmentZip(item)"
        />
        <a v-if="hasLink(item, 'json')" download v-bind:href="item['json']">
          .json<download-icon />
        </a>
        <!--
          REMOVED AND REPLACED WITH generatePayablesCSVSQL
          <action-button
            v-if="hasLink(item, 'json')"
            type="download"
            @click="generatePayablesCSV(item['json'])"
          >
            payables
          </action-button>
        -->
        <action-button
          type="download"
          @click="generatePayablesCSVSQL(item.weekEnding, 'weekly')"
        >
          payablesSQL
        </action-button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  collection,
  CollectionReference,
  DocumentData,
  query,
  orderBy,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { defineComponent } from "vue";
import { useStateStore } from "../stores/state";
import { exportDate, generatePayablesCSVSQL } from "./helpers";
import ActionButton from "./ActionButton.vue";
import { DownloadIcon } from "vue-feather-icons";

const db = getFirestore(firebaseApp);

export default defineComponent({
  setup() {
    const store = useStateStore();
    const { startTask, endTask } = store;
    return { startTask, endTask, claims: store.claims };
  },
  props: ["collectionName"],
  components: { ActionButton, DownloadIcon },
  computed: {
    canRefresh(): boolean {
      return (
        Object.prototype.hasOwnProperty.call(this.claims, "admin") &&
        this.claims["admin"] === true
      );
    },
  },
  data() {
    return {
      parentPath: "",
      collectionObject: null as CollectionReference | null,
      items: [],
    };
  },
  methods: {
    exportDate,
    generatePayablesCSVSQL,
    hasLink(item: DocumentData, property: string) {
      return (
        Object.prototype.hasOwnProperty.call(item, property) &&
        item[property].length > 32
      );
    },
    async generateAttachmentZip(item: DocumentData) {
      const functions = getFunctions(firebaseApp);
      const generateExpenseAttachmentArchive = httpsCallable(
        functions,
        "generateExpenseAttachmentArchive"
      );
      this.startTask({
        id: `generateAttachments${item.id}`,
        message: "Generating Attachments",
      });
      try {
        await generateExpenseAttachmentArchive({ id: item.id });
      } catch (error) {
        alert(error);
      }
      this.endTask(`generateAttachments${item.id}`);
    },
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
    this.collectionObject = collection(db, this.collectionName);
    this.$firestoreBind(
      "items",
      query(this.collectionObject, orderBy("weekEnding", "desc"))
    ).catch((error: unknown) => {
      if (error instanceof Error) {
        alert(`Can't load ExpenseTracking: ${error.message}`);
      } else alert(`Can't load ExpenseTracking: ${JSON.stringify(error)}`);
    });
  },
});
</script>
