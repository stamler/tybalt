<template>
  <List :select="true && hasPermission" :del="true && hasPermission">
    <template v-slot:columns="{ item }">
      <td>{{ item.mfg }}</td>
      <td>{{ item.model }}</td>
      <td>{{ item.upn }}</td>
      <td>{{ item.serial }}</td>
      <td>
        {{ item.networkConfig[Object.keys(item.networkConfig)[0]].dnsHostname }}
      </td>
      <td>{{ item.created.toDate() | relativeTime }}</td>
      <td>
        <span v-if="!item.userSourceAnchor">userSourceAnchor</span>
        <span v-if="!item.serial">
          serial
          {{
            guessSerial(
              item.networkConfig[Object.keys(item.networkConfig)[0]].dnsHostname
            )
          }}
        </span>
        <span v-if="isNaN(item.radiatorVersion)">radiatorVersion</span>
      </td>
    </template>
  </List>
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
        mfg: { display: "Manufacturer" },
        model: { display: "Model" },
        upn: { display: "UPN" },
        serial: { display: "Serial" },
        dnsHostname: { display: "DNS Hostname", sort: false },
        created: true,
        issues: { sort: false }
      },
      collection: db.collection("RawLogins"),
      items: db.collection("RawLogins")
    };
  },
  computed: {
    ...mapState(["claims"]),
    // Determine whether to show UI controls based on claims
    hasPermission() {
      return (
        this.claims.hasOwnProperty("rawlogins") && this.claims["rawlogins"]
      );
    }
  },
  methods: {
    guessSerial(dnsHostname) {
      try {
        return dnsHostname.split("-")[1] || "";
      } catch (error) {
        return "";
      }
    }
  },
  filters: {
    relativeTime(date) {
      return moment(date).fromNow();
    }
  }
};
</script>
