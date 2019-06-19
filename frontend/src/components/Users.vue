<template>
  <List />
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import moment from "moment";
import List from "./UsersList";

export default {
  components: { List },
  data() {
    return {
      schema: {
        givenName: true,
        surname: true,
        created: true,
        updated: true,
        userSourceAnchor: { display: "ms-DS-ConsistencyGuid" },
        lastComputer: { display: "Last Computer" }
      },
      collection: db.collection("Users"),
      items: db.collection("Users")
    };
  },
  filters: {
    dateFormat(date) {
      return moment(date).format("YYYY MMM DD / HH:mm:ss");
    },
    relativeTime(date) {
      return moment(date).fromNow();
    }
  }
};
</script>
