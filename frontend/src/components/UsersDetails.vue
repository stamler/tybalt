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
    <div v-for="login in logins" v-bind:key="login.id">
      {{ login.created.toDate() | relativeTime }}
      <router-link
        v-bind:to="{ name: 'Computer Details', params: { id: login.computer } }"
      >
        {{ login.computer }}
      </router-link>
    </div>
  </div>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import { format, formatDistanceToNow } from "date-fns";

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
      return format(date, "yyyy MMM dd / HH:mm:ss");
    },
    relativeTime(date) {
      return formatDistanceToNow(date, { addSuffix: true });
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
                    .where("userSourceAnchor", "==", this.item.userSourceAnchor)
                    .orderBy("created", "desc")
                );
              } else {
                // The provided id is either a userSourceAnchor or the actual
                // object id. Since the object id doesn't exist, try the
                // userSourceAnchor before failing.
                this.$parent.collection
                  .where("userSourceAnchor", "==", id)
                  .get()
                  .then(snap => {
                    if (snap.size !== 1) {
                      // Either doesn't exist or multiple exist,
                      // (an error condition). List instead
                      // TODO: show a message to the user
                      this.$router.push(this.parentPath);
                    } else {
                      console.log("id not found, using userSourceAnchor");
                      this.item = snap.docs[0].data();
                      this.$bind(
                        "logins",
                        db
                          .collection("Logins")
                          .where(
                            "userSourceAnchor",
                            "==",
                            this.item.userSourceAnchor
                          )
                          .orderBy("created", "desc")
                      );
                    }
                  });
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
      return assignComputerToUser({ computer, user }).catch(error => {
        alert(`Error assigning ${computer} to ${user}: ${error}`);
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
