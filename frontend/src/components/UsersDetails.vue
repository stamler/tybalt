<template>
  <div>
    <template v-if="item">
      <div>{{ item.givenName }} {{ item.surname }}</div>
      <div>
        <div>mail: {{ item.email }} upn:{{ item.upn }}</div>
        <div>{{ item.userSourceAnchor }}</div>
      </div>
      <div v-if="item.updated">
        updated {{ item.updated.toDate() | dateFormat }}
      </div>
    </template>
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

<script lang="ts">
import firebase from "../firebase";
const db = firebase.firestore();
import { format, formatDistanceToNow } from "date-fns";
import Vue from "vue";

export default Vue.extend({
  props: ["id"],
  data() {
    return {
      collection: db.collection("Users"),
      item: {} as firebase.firestore.DocumentData | undefined,
      logins: []
    };
  },
  filters: {
    dateFormat(date: Date) {
      return format(date, "yyyy MMM dd / HH:mm:ss");
    },
    relativeTime(date: Date) {
      return formatDistanceToNow(date, { addSuffix: true });
    }
  },
  watch: {
    id: {
      immediate: true,
      handler(id) {
        if (id) {
          this.collection
            .doc(id)
            .get()
            .then(snap => {
              if (snap.exists) {
                this.item = snap.data();
                const usa = this?.item?.userSourceAnchor ?? false;
                if (usa) {
                  this.$bind(
                    "logins",
                    db
                      .collection("Logins")
                      .where("userSourceAnchor", "==", usa)
                      .orderBy("created", "desc")
                  );
                }
              } else {
                // The provided id is either a userSourceAnchor or the actual
                // object id. Since the object id doesn't exist, try the
                // userSourceAnchor before failing.
                this.collection
                  .where("userSourceAnchor", "==", id)
                  .get()
                  .then(snap => {
                    if (snap.size !== 1) {
                      // Either doesn't exist or multiple exist,
                      if (snap.size > 1) {
                        throw new Error(
                          `Multiple Users have the userSourceAnchor ${id}. ` +
                            "Please alert your System Administrator."
                        );
                      }
                      // TODO: crashlytics? Is there a way to record this
                      // in the back end?
                      // Silently redirect to the Users path since the
                      // userSourceAnchor wasn't found.
                      this.$router.push({ name: "Users" });
                    } else {
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
  }
});
</script>
<style scoped>
.anchorbox {
  flex-basis: 6.5em;
}
</style>
