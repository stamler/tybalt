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
  },
  computed: mapState(["claims"]),
  created() {
    // Modify UI based on permissions and business requirements here
    this.create = this.select = this.del = this.edit =
      this.claims.hasOwnProperty("users") &&
      this.claims["users"] === true
  }
}
</script>
