<template>
  <List>
    <template v-slot:columns="{ item }">
      <td>{{ item.givenName }}</td>
      <td>{{ item.surname }}</td>
      <td>{{ item.created.toDate() | relativeTime }}</td>
      <td>{{ item.computer }}</td>
    </template>
  </List>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import { mapState } from "vuex";
import moment from "moment";
import List from "./List2";

export default {
  components: { List },
  data() {
    return {
      schema: {
        givenName: {display: "First Name"},
        surname: {display: "Last Name"},
        created: true,
        computer: {display: "Computer"},
      },
      collection: db.collection("Logins"),
      items: db.collection("Logins").orderBy("created", "desc").limit(101),
    }
  },
  computed: mapState(["claims"]),
  filters: {
    relativeTime(date) {
      return moment(date).fromNow();
    }
  }
}
</script>
