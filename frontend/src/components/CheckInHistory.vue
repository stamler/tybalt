<template>
  <div>
    <div id="dash">
      <div class="infobox">
        <h2>Your Check-ins</h2>

        <ul>
          <li v-for="checkin in items" v-bind:key="checkin.id">
            <div class="checkin">
              {{ locations[checkin.location] }} — {{ relativeTime(checkin.time) }}
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { User } from "firebase/auth";
import { defineComponent } from "vue";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  where,
  Timestamp,
} from "firebase/firestore";
import { useCollection } from "vuefire";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useStateStore } from "../stores/state";
import { formatDistanceToNow } from "date-fns";
const db = getFirestore(firebaseApp);

export default defineComponent({
  setup() {
    const stateStore = useStateStore();
    const showTasks = stateStore.showTasks;
    // TODO: similar to WelcomeSettings.vue, can't figure out why this is
    // undefined using storeToRefs but it works this way
    const user = stateStore.user;
    const { startTask, endTask } = stateStore;
    return { user, showTasks, startTask, endTask };
    // user has no type information when accessing this.user.uid below
    // this discussion may be relevant:
    // https://github.com/vuejs/pinia/discussions/1178
  },
  data() {
    return {
      items: useCollection(
        query(
          collection(db, "CheckIns"),
          where("uid", "==", (this.user as unknown as User).uid),
          orderBy("time", "desc")
        )
      ),
      locations: {
        Home: "Home",
        Yonge: "1918 Yonge St",
        "14Quebec": "14 Quebec St",
        "15Quebec": "15 Quebec St",
        Field: "In the Field",
        Lab: "Lab at 274 Kingston",
      },
    };
  },
  methods: {
    async submitCheckIn(location: string) {
      const functions = getFunctions(firebaseApp);
      const checkIn = httpsCallable(functions, "checkIn");
      this.startTask({
        id: "checkIn",
        message: "checking in...",
      });
      await checkIn({ location })
        .then(() => {
          this.endTask("checkIn");
        })
        .catch((error) => {
          this.endTask("checkIn");
          alert(`Error checking in: ${error.message}`);
        });
    },
    relativeTime(date: Timestamp | undefined): string {
      if (date === undefined) {
        return "";
      }
      return formatDistanceToNow(date.toDate(), { addSuffix: true });
    },
  },
});
</script>

<style>
#dash {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
#dash img,
h2 {
  align-self: center;
}
#spacer {
  background-color: rgb(255, 163, 51);
  flex: 0 0 3em;
}
.infobox {
  width: 100%;
  padding: 0em 0.4em;
  margin-bottom: 2em;
  background-color: ivory;
}
li {
  list-style-type: none;
}
</style>
