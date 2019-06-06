<template>
  <List/>
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
        givenName: {display: "First Name"},
        surname: {display: "Last Name"},
        created: {
          derivation: obj => moment(obj.created.toDate()).fromNow()
        },
        computer: {display: "Computer"},
      },
      collection: db.collection("Logins"),
      items: db.collection("Logins").orderBy("created", "desc").limit(101),
    }
  },
  computed: mapState(["claims"]),
}
</script>
