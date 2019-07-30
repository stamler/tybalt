<template>
  <div>
    <div>{{ item.givenName }} {{ item.surname }}</div>
    <div>
      <div>mail: {{ item.email }} upn:{{ item.upn }}</div>
      <div>{{ item.userSourceAnchor }}</div>
      <div v-if="item.updated">
        updated {{ item.updated.toDate() | dateFormat }}
      </div>
    </div>

    <div>Login History</div>
    <div v-for="login in logins" v-bind:key="login">
      {{ login.created.toDate() | relativeTime }}
      <router-link v-bind:to="{name: 'Computer Details', params: { id: login.computer }}">
        {{ login.computer }}
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
                    .where("userSourceAnchor", "==", id)
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
