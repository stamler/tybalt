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
      <div class="anchorbox">{{ item.created.toDate() | relativeTime }}</div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">{{ item.mfg }} {{ item.model }}</div>
          <div class="byline">
            <span v-if="item.serial">
              <router-link
                v-bind:to="{
                  name: 'Computer Details',
                  params: { id: makeSlug(item) },
                }"
              >
                {{ item.serial }}
              </router-link>
            </span>
          </div>
        </div>
        <div class="firstline">{{ item.upn }} {{ item.userSourceAnchor }}</div>
        <div class="secondline">
          Hostname
          {{
            item.networkConfig[Object.keys(item.networkConfig)[0]].dnsHostname
          }}
          reported from radiator v{{ item.radiatorVersion }}
        </div>
        <div class="thirdline">
          <span v-if="!item.userSourceAnchor">missing userSourceAnchor</span>
          <span v-if="!item.serial">
            missing serial {{ guessSerial(item) }}
          </span>
          <span v-if="isNaN(item.radiatorVersion)">
            missing radiatorVersion
          </span>
        </div>
      </div>
      <div class="rowactionsbox">
        <action-button type="delete" @click="del(item, collectionObject)" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from "vue";
import { searchString } from "./helpers";
import { formatDistanceToNow } from "date-fns";
import firebase from "../firebase";
const db = firebase.firestore();
import ActionButton from "./ActionButton.vue";
import { del } from "./helpers";
export default Vue.extend({
  props: ["collection"],
  components: {
    ActionButton,
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
  filters: {
    relativeTime(date: Date): string {
      return formatDistanceToNow(date, { addSuffix: true });
    },
  },
  data() {
    return {
      search: "",
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      items: [] as firebase.firestore.DocumentData[],
    };
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.$bind("items", this.collectionObject.orderBy("created", "desc")).catch(
      (error) => {
        alert(`Can't load Raw Logins: ${error.message}`);
      }
    );
  },
  methods: {
    del,
    guessSerial(item: firebase.firestore.DocumentData): string {
      const dnsHostname =
        item.networkConfig[Object.keys(item.networkConfig)[0]].dnsHostname;
      try {
        return dnsHostname.split("-")[1] || "";
      } catch (error) {
        return "";
      }
    },
    makeSlug(item: firebase.firestore.DocumentData): string {
      const serial = item.serial;
      const mfg = item.mfg;
      const sc = serial.replace(/\s|\/|,/g, "");
      const mc = mfg
        .toLowerCase()
        .replace(/\/|\.|,|inc|ltd/gi, "")
        .trim()
        .replace(/ /g, "_");
      if (sc.length >= 4 && mc.length >= 2) {
        return sc + "," + mc;
      } else {
        throw new Error(`serial ${sc} or manufacturer ${mc} too short`);
      }
    },
  },
});
</script>
<style scoped>
.anchorbox {
  flex-basis: 7.2em;
}
</style>
