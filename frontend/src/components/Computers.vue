<template>
  <List>
    <template v-slot:columns="{ item }">
      <td>
        <span v-if="!item.computerName.includes(item.serial)">
          ❗({{ item.serial }})
        </span>
        <br />
        {{ item.computerName }}
      </td>
      <td>{{ item.osVersion }}</td>
      <td>{{ item.mfg }}</td>
      <td>{{ item.model }}</td>
      <td>{{ item.userGivenName }}</td>
      <td>{{ item.userSurname }}</td>
      <td>
        <span v-if="!item.assigned">
          <!-- Show this if the device has no assignment -->
          <button
            v-if="claims.computers === true"
            v-on:click="assign(item.id, item.userSourceAnchor)"
          >
            assign
          </button>
        </span>
        <span
          v-else-if="item.assigned.userSourceAnchor !== item.userSourceAnchor"
        >
          <!-- Show this if the device has an assignment that doesn't
          match the last user login-->
          <button v-on:click="assign(item.id, item.userSourceAnchor)">
            ❗assign, currently {{ item.assigned.givenName }}
            {{ item.assigned.surname }}
          </button>
        </span>
        <span v-else>{{ item.assigned.time.toDate() | relativeTime }}</span>
      </td>
      <td>{{ item.updated.toDate() | relativeTime }}</td>
      <td>{{ item.created.toDate() | dateFormat }}</td>
    </template>
  </List>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import { mapState } from "vuex";
import moment from "moment";
import List from "./ComputersList";

export default {
  components: { List },
  data() {
    return {
      schema: {
        computerName: { display: "Computer" },
        osVersion: { display: "Windows" },
        mfg: true,
        model: true,
        userGivenName: { display: "First" },
        userSurname: { display: "Last" },
        assigned: { sort: false },
        updated: true,
        created: true
      },
      collection: db.collection("Computers"),
      items: db.collection("Computers")
    };
  },
  computed: {
    ...mapState(["claims"]),
    // Determine whether to show UI controls based on claims
    hasPermission() {
      return (
        this.claims.hasOwnProperty("computers") && this.claims["computers"]
      );
    }
  },
  methods: {
    assign(computer, user) {
      const assignComputerToUser = firebase
        .functions()
        .httpsCallable("assignComputerToUser");
      return assignComputerToUser({ computer, user })
        .then(() => {
          console.log(`assigned computer ${computer} to ${user}`);
        })
        .catch(error => {
          console.log(error);
          console.log(`assignComputerTouser(${computer}, ${user}) didn't work`);
        });
    }
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
