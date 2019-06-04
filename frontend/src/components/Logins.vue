<template>
  <div>
    <div id="nav">
      <router-link to="list">List</router-link>&nbsp;
      <router-link v-if="create" to="add">New</router-link>
    </div>
    <router-view/>
  </div>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import { mapState } from "vuex";
import moment from "moment";

export default {
  data() {
    return {
      create: false,
      select: false,
      edit: false,
      del: false,
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
