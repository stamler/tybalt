<template>
  <List :select="true && hasPermission" :del="true && hasPermission"/>
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
        mfg: {display: "Manufacturer"},
        model: {display: "Model"},
        upn: {display: "UPN"},
        serial: {display: "Serial"},
        dnsHostname: {
          display: "DNS Hostname", 
          sort:false,
          editable: false, // This field shouldn't be visible in any editors
          derivation: obj => obj.networkConfig[Object.keys(obj.networkConfig)[0]].dnsHostname
        },
        created: {
          derivation: obj => moment(obj.created.toDate()).fromNow()
        },
        issues: {
          sort: false,
          editable: false,
          derivation: obj => {
            let issues = [];
            if (!obj.userSourceAnchor) issues.push("userSourceAnchor");
            if (isNaN(obj.radiatorVersion)) issues.push("radiatorVersion");
            if (!obj.serial) {
              const dnsHostname = obj.networkConfig[Object.keys(obj.networkConfig)[0]].dnsHostname
              let sn_msg = "serial ";
              try {
                sn_msg += dnsHostname.split("-")[1] || "";
              } catch (error) {
                sn_msg += "";
              }
              issues.push(sn_msg);
            }
            return issues.join(" ");
          }
        }
      },
      collection: db.collection("RawLogins"),
      items: db.collection("RawLogins"),
    }
  },
  computed: {
    ...mapState(["claims"]),
    // Determine whether to show UI controls based on claims
    hasPermission () {
      return this.claims.hasOwnProperty("rawlogins") &&
        this.claims["rawlogins"];
    }
  }
}
</script>
