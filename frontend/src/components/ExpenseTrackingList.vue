<template>
  <div id="list">
    <div class="listentry" v-for="item in items" v-bind:key="item.id">
      <div class="anchorbox">
        <router-link :to="[parentPath, item.id, 'details'].join('/')">
          {{ item.weekEnding.toDate() | exportDate }}
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
import firebase from "../firebase";
import Vue from "vue";
import { mapState } from "vuex";
import { generatePayablesCSVSQL } from "./helpers";
import store from "../store";
import { format } from "date-fns";
import ActionButton from "./ActionButton.vue";
import { DownloadIcon } from "vue-feather-icons";

const db = firebase.firestore();

export default Vue.extend({
  props: ["collection"],
  components: { ActionButton, DownloadIcon },
  computed: {
    ...mapState(["claims"]),
    canRefresh(): boolean {
      return (
        Object.prototype.hasOwnProperty.call(this.claims, "admin") &&
        this.claims["admin"] === true
      );
    },
  },
  filters: {
    exportDate(date: Date) {
      return format(date, "yyyy MMM dd");
    },
  },
  data() {
    return {
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      items: [],
    };
  },
  methods: {
    generatePayablesCSVSQL,
    hasLink(item: firebase.firestore.DocumentData, property: string) {
      return (
        Object.prototype.hasOwnProperty.call(item, property) &&
        item[property].length > 32
      );
    },
    async generateAttachmentZip(item: firebase.firestore.DocumentData) {
      const generateExpenseAttachmentArchive = firebase
        .functions()
        .httpsCallable("generateExpenseAttachmentArchive");
      store.commit("startTask", {
        id: `generateAttachments${item.id}`,
        message: "Generating Attachments",
      });
      try {
        await generateExpenseAttachmentArchive({ id: item.id });
      } catch (error) {
        alert(error);
      }
      store.commit("endTask", {
        id: `generateAttachments${item.id}`,
      });
    },
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.$bind(
      "items",
      this.collectionObject.orderBy("weekEnding", "desc")
    ).catch((error: unknown) => {
      if (error instanceof Error) {
        alert(`Can't load ExpenseTracking: ${error.message}`);
      } else alert(`Can't load ExpenseTracking: ${JSON.stringify(error)}`);
    });
  },
});
</script>
