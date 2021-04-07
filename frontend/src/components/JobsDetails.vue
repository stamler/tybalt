<template>
  <div>
    <h3>{{ this.id }}</h3>
    <div>client: {{ item.client }}</div>
    <div>client contact: {{ item.clientContact }}</div>
    <div>description: {{ item.description }}</div>
    <div>manager: {{ item.manager }}</div>
    <div>status: {{ item.status }}</div>

    <br />
    <h4>Work History</h4>
    <div v-for="timeSheet in timeSheets" v-bind:key="timeSheet.id">
      {{ timeSheet.weekEnding.toDate() | relativeTime }} -
      <router-link
        v-bind:to="{
          name: 'Time Sheet Details',
          params: { id: timeSheet.id },
        }"
        >{{ timeSheet.displayName }}</router-link
      >
      /hours: {{ timeSheet.jobsTally[id].hours }} /jobHours:
      {{ timeSheet.jobsTally[id].jobHours }}
    </div>
  </div>
</template>

<script lang="ts">
import Vue from "vue";
import firebase from "../firebase";
const db = firebase.firestore();
import { format, formatDistanceToNow } from "date-fns";

export default Vue.extend({
  props: ["id", "collection"],
  data() {
    return {
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      item: {} as firebase.firestore.DocumentData,
      timeSheets: [],
    };
  },
  filters: {
    dateFormat(date: Date): string {
      return format(date, "yyyy MMM dd / HH:mm:ss");
    },
    relativeTime(date: Date): string {
      return formatDistanceToNow(date, { addSuffix: true });
    },
  },
  watch: {
    id: function (id) {
      this.setItem(id);
    }, // first arg is newVal, second is oldVal
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.setItem(this.id);
  },
  methods: {
    setItem(id: string) {
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }
      if (id) {
        this.collectionObject
          .doc(id)
          .get()
          .then((snap: firebase.firestore.DocumentSnapshot) => {
            const result = snap.data();
            if (result === undefined) {
              // A document with this id doesn't exist in the database,
              // list instead.
              this.$router.push(this.parentPath);
            } else {
              this.item = result;
              this.$bind(
                "timeSheets",
                db
                  .collection("TimeSheets")
                  .where("locked", "==", true)
                  .where("jobNumbers", "array-contains", this.id)
                  .orderBy("weekEnding", "desc")
              ).catch((error) => {
                alert(`Can't load time sheets: ${error.message}`);
              });
            }
          });
      } else {
        this.item = {};
      }
    },
  },
});
</script>
