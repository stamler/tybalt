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
  computed: mapState(["claims"]),
  created() {
    // Modify UI based on permissions and business requirements here
    this.select = this.del =
      this.claims.hasOwnProperty("rawlogins") &&
      this.claims["rawlogins"] === true
  }
}
</script>
