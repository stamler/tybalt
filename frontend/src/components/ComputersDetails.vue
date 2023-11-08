<template>
  <div>
    <div>
      {{ item.computerName }}
      <span v-if="item.retired">
        (Retired {{ relativeTime(item.retired.toDate()) }})
      </span>
    </div>
    <div>
      <div>
        {{ item.mfg }} {{ item.model }} ({{ systemType(item.systemType) }})
      </div>
      <div>
        Windows {{ item.osVersion }} {{ item.osArch }}, SKU:{{ item.osSku }}
      </div>
      <div v-if="item.created">
        created {{ dateFormat(item.created.toDate()) }}
      </div>
      <div v-if="item.updated">
        updated {{ dateFormat(item.updated.toDate()) }} (radiator v{{
          item.radiatorVersion
        }})
      </div>
      <div>
        {{ item.bootDrive }} ({{ item.bootDriveFS }})
        {{ humanFileSize(item.bootDriveCap) }} /
        {{ humanFileSize(item.bootDriveFree) }} Free ({{
          Math.floor((100 * item.bootDriveFree) / item.bootDriveCap)
        }}%)
      </div>
      <div>{{ humanFileSize(item.ram) }} RAM</div>
      <div v-for="(props, mac) in item.networkConfig" v-bind:key="mac">
        <div>{{ mac }}: {{ props.ips }}</div>
      </div>
    </div>

    <div>Login History (up to 20)</div>
    <div v-for="login in logins" v-bind:key="login.id">
      {{ relativeTime(login.created.toDate()) }}
      <!-- 
        TODO: FIX THIS This will break when the userSourceAnchor and the Users id 
        do not match. BUG
      -->
      <router-link
        v-bind:to="{
          name: 'User Details',
          params: { id: login.userSourceAnchor },
        }"
      >
        {{ login.givenName }}
        {{ login.surname }}
      </router-link>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  CollectionReference,
  DocumentData,
  DocumentSnapshot,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
const db = getFirestore(firebaseApp);
import { dateFormat } from "./helpers";
import { formatDistanceToNow } from "date-fns";

export default defineComponent({
  props: ["id", "collectionName"],
  data() {
    return {
      parentPath: "",
      collectionObject: null as CollectionReference | null,
      item: {} as DocumentData,
      logins: [] as DocumentData[],
    };
  },
  watch: {
    id: function (id) {
      this.setItem(id);
    }, // first arg is newVal, second is oldVal
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
    this.collectionObject = collection(db, this.collectionName);
    this.setItem(this.id);
  },
  methods: {
    dateFormat,
    systemType(type: number): string {
      enum SystemTypes {
        Desktop = 1,
        Mobile,
        Workstation,
        "Enterprise Server",
        "SOHO Server",
        "Appliance PC",
        "Performance Server",
        Maximum,
      }
      return SystemTypes[type];
    },
    humanFileSize(bytes: number, si: boolean = false): string {
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
    },
    setItem(id: string) {
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }
      if (id) {
        getDoc(doc(this.collectionObject, id)).then(
          (snap: DocumentSnapshot) => {
            const result = snap.data();
            if (result === undefined) {
              // A document with this id doesn't exist in the database,
              // list instead.
              this.$router.push(this.parentPath);
            } else {
              this.item = result;
              this.$firestoreBind(
                "logins",
                query(
                  collection(db, "Logins"),
                  where("computer", "==", id),
                  orderBy("created", "desc"),
                  limit(20)
                )
              ).catch((error: unknown) => {
                if (error instanceof Error)
                  alert(`Can't load logins: ${error.message}`);
                else alert(`Can't load logins: ${JSON.stringify(error)}`);
              });
            }
          }
        );
      } else {
        this.item = {};
      }
    },
    async assign(computerId: string, userSourceAnchor: string) {
      const functions = getFunctions(firebaseApp);
      const assignComputerToUser = httpsCallable(
        functions,
        "assignComputerToUser"
      );
      return assignComputerToUser({ computerId, userSourceAnchor }).catch(
        (error) => {
          alert(`Computer assignment failed: ${error}`);
        }
      );
    },
    relativeTime(date: Date): string {
      return formatDistanceToNow(date, { addSuffix: true });
    },
  },
});
</script>
<style scoped>
.anchorbox {
  flex-basis: 6.5em;
}
</style>
