<template>
  <List />
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import { mapState } from "vuex";
import moment from "moment";
import List from "./List";

export default {
  components: { List },
  data() {
    return {
      schema: {
        givenName: true,
        surname: true,
        updated: {
          derivation: obj => moment(obj.updated.toDate()).fromNow()
        },
        userSourceAnchor: {display: "ms-DS-ConsistencyGuid"},
        lastComputer: {display: "Last Computer"},
      },
      collection: db.collection("Users"),
      items: db.collection("Users"),
    }
  }
}
</script>
