<template>
  <div>
    <div>{{ item.computerName }}</div>
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

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import moment from "moment";

export default {
  props: ["id"],
  data() {
    return {
      parentPath: null,
      collection: null,
      item: {},
      logins: []
    };
  },
  filters: {
    dateFormat(date) {
      return moment(date).format("YYYY MMM DD / HH:mm:ss");
    },
    relativeTime(date) {
      return moment(date).fromNow();
    },
    systemType(type) {
      const types = {
        1: "Desktop",
        2: "Mobile",
        3: "Workstation",
        4: "Enterprise Server",
        5: "SOHO Server",
        6: "Appliance PC",
        7: "Performance Server",
        8: "Maximum"
      };
      return types[type];
    },
    humanFileSize(bytes, si) {
      var thresh = si ? 1000 : 1024;
      if (Math.abs(bytes) < thresh) {
        return bytes + " B";
      }
      var units = si
        ? ["kB", "MB", "GB", "TB", "PB", "EB"]
        : ["KiB", "MiB", "GiB", "TiB", "PiB", "EiB"];
      var u = -1;
      do {
        bytes /= thresh;
        ++u;
      } while (Math.abs(bytes) >= thresh && u < units.length - 1);
      return bytes.toFixed(1) + " " + units[u];
    }
  },
  watch: {
    id: {
      immediate: true,
      handler(id) {
        if (id) {
          this.$parent.collection
            .doc(id)
            .get()
            .then(snap => {
              if (snap.exists) {
                this.item = snap.data();
                this.$bind(
                  "logins",
                  db
                    .collection("Logins")
                    .where("computer", "==", id)
                    .orderBy("created", "desc")
                );
              } else {
                // The id doesn't exist, list instead
                // TODO: show a message to the user
                this.$router.push(this.parentPath);
              }
            });
        } else {
          this.item = {};
        }
      }
    }
  },
  created() {
    const currentRoute = this.$route.matched[this.$route.matched.length - 1];
    this.parentPath = currentRoute.parent.path;
    this.collection = this.$parent.collection;
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
  }
};
</script>
<style scoped>
.anchorbox {
  flex-basis: 6.5em;
}
</style>
