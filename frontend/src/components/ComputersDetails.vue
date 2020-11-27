<template>
  <div>
    <div>
      {{ item.computerName }}
      <span v-if="item.retired">
        (Retired {{ item.retired.toDate() | relativeTime }})
      </span>
    </div>
    <div>
      <div>
        {{ item.mfg }} {{ item.model }} ({{ item.systemType | systemType }})
      </div>
      <div>
        Windows {{ item.osVersion }} {{ item.osArch }}, SKU:{{ item.osSku }}
      </div>
      <div v-if="item.created">
        created {{ item.created.toDate() | dateFormat }}
      </div>
      <div v-if="item.updated">
        updated {{ item.updated.toDate() | dateFormat }} (radiator v{{
          item.radiatorVersion
        }})
      </div>
      <div>
        {{ item.bootDrive }} ({{ item.bootDriveFS }})
        {{ item.bootDriveCap | humanFileSize }} /
        {{ item.bootDriveFree | humanFileSize }} Free ({{
          Math.floor((100 * item.bootDriveFree) / item.bootDriveCap)
        }}%)
      </div>
      <div>{{ item.ram | humanFileSize }} RAM</div>
      <div v-for="(props, mac) in item.networkConfig" v-bind:key="mac">
        <div>{{ mac }}: {{ props.ips }}</div>
      </div>
    </div>

    <div>Login History</div>
    <div v-for="login in logins" v-bind:key="login.id">
      {{ login.created.toDate() | relativeTime }}
      <!-- 
        TODO: FIX THIS This will break when the userSourceAnchor and the Users id 
        do not match. BUG
      -->
      <router-link
        v-bind:to="{
          name: 'User Details',
          params: { id: login.userSourceAnchor }
        }"
      >
        {{ login.givenName }}
        {{ login.surname }}
      </router-link>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from "vue";
import firebase from "../firebase";
const db = firebase.firestore();
import { format, formatDistanceToNow } from "date-fns";

export default Vue.extend({
  props: ["id", "collection"],
  data() {
    return {
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      item: {} as firebase.firestore.DocumentData,
      logins: []
    };
  },
  filters: {
    dateFormat(date: Date): string {
      return format(date, "yyyy MMM dd / HH:mm:ss");
    },
    relativeTime(date: Date): string {
      return formatDistanceToNow(date, { addSuffix: true });
    },
    systemType(type: number): string {
      enum SystemTypes {
        Desktop = 1,
        Mobile,
        Workstation,
        "Enterprise Server",
        "SOHO Server",
        "Appliance PC",
        "Performance Server",
        Maximum
      }
      return SystemTypes[type];
    },
    humanFileSize(bytes: number, si: boolean): string {
      const thresh = si ? 1000 : 1024;
      if (Math.abs(bytes) < thresh) {
        return bytes + " B";
      }
      const units = si
        ? ["kB", "MB", "GB", "TB", "PB", "EB"]
        : ["KiB", "MiB", "GiB", "TiB", "PiB", "EiB"];
      let u = -1;
      do {
        bytes /= thresh;
        ++u;
      } while (Math.abs(bytes) >= thresh && u < units.length - 1);
      return bytes.toFixed(1) + " " + units[u];
    }
  },
  watch: {
    id: function(id) {
      this.setItem(id);
    } // first arg is newVal, second is oldVal
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.setItem(this.id);
  },
  methods: {
    setItem(id: string) {
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }
      if (id) {
        this.collectionObject
          .doc(id)
          .get()
          .then((snap: firebase.firestore.DocumentSnapshot) => {
            const result = snap.data();
            if (result === undefined) {
              // A document with this id doesn't exist in the database,
              // list instead.
              this.$router.push(this.parentPath);
            } else {
              this.item = result;
              this.$bind(
                "logins",
                db
                  .collection("Logins")
                  .where("computer", "==", id)
                  .orderBy("created", "desc")
              ).catch(error => {
                alert(`Can't load logins: ${error.message}`);
              });
            }
          });
      } else {
        this.item = {};
      }
    },
    assign(computerId: string, userId: string) {
      const assignComputerToUser = firebase
        .functions()
        .httpsCallable("assignComputerToUser");
      return assignComputerToUser({ computerId, userId }).catch(error => {
        alert(`Computer assignment failed: ${error}`);
      });
    }
  }
});
</script>
<style scoped>
.anchorbox {
  flex-basis: 6.5em;
}
</style>
