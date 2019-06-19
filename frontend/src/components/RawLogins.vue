<template>
  <List />
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import { mapState } from "vuex";
import moment from "moment";
import List from "./RawLoginsList";

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
