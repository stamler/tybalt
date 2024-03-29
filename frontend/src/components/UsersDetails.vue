<template>
  <div>
    <template v-if="item">
      <div>{{ item.givenName }} {{ item.surname }}</div>
      <div>
        <div>mail: {{ item.email }} upn:{{ item.upn }}</div>
        <div>{{ item.userSourceAnchor }}</div>
      </div>
      <div v-if="item.updated">
        updated {{ dateFormat(item.updated.toDate()) }}
      </div>
    </template>
    <div>Login History</div>
    <div v-for="login in logins" v-bind:key="login.id">
      {{ relativeTime(login.created.toDate()) }}
      <router-link
        v-bind:to="{ name: 'Computer Details', params: { id: login.computer } }"
      >
        {{ login.computer }}
      </router-link>
    </div>
  </div>
</template>

<script lang="ts">
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  DocumentData,
  DocumentSnapshot,
  QuerySnapshot,
  query,
  getDocs,
  where,
  orderBy,
} from "firebase/firestore";
const db = getFirestore(firebaseApp);
import { formatDistanceToNow } from "date-fns";
import { dateFormat } from "./helpers";
import { defineComponent } from "vue";

export default defineComponent({
  props: ["id"],
  data() {
    return {
      collectionObject: collection(db, "Users"),
      item: {} as DocumentData | undefined,
      logins: [] as DocumentData[],
    };
  },
  methods: {
    relativeTime(date: Date) {
      return formatDistanceToNow(date, { addSuffix: true });
    },
    dateFormat,
  },
  watch: {
    id: {
      immediate: true,
      handler(id) {
        if (id) {
          getDoc(doc(this.collectionObject, id)).then(
            (snap: DocumentSnapshot) => {
              if (snap.exists()) {
                this.item = snap.data();
                const usa = this?.item?.userSourceAnchor ?? false;
                if (usa) {
                  this.$firestoreBind(
                    "logins",
                    query(
                      collection(db, "Logins"),
                      where("userSourceAnchor", "==", usa),
                      orderBy("created", "desc")
                    )
                  );
                }
              } else {
                // The provided id is either a userSourceAnchor or the actual
                // object id. Since the object id doesn't exist, try the
                // userSourceAnchor before failing.
                getDocs(
                  query(
                    this.collectionObject,
                    where("userSourceAnchor", "==", id)
                  )
                ).then((snap: QuerySnapshot) => {
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
                    this.$firestoreBind(
                      "logins",
                      query(
                        collection(db, "Logins"),
                        where(
                          "userSourceAnchor",
                          "==",
                          this.item.userSourceAnchor
                        ),
                        orderBy("created", "desc")
                      )
                    );
                  }
                });
              }
            }
          );
        } else {
          this.item = {};
        }
      },
    },
  },
});
</script>
<style scoped>
.anchorbox {
  flex-basis: 6.5em;
}
</style>
