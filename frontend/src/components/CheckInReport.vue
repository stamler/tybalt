<template>
  <div>
    <div id="dash">
      <div class="infobox">
        <h2>Today's Check-ins</h2>
        <object-table :tableData="filteredItems"></object-table>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  DocumentData,
  collection,
  query,
  orderBy,
  where,
  Timestamp,
} from "firebase/firestore";
import { useCollection } from "vuefire";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useStateStore } from "../stores/state";
import { getTimezoneOffset } from "date-fns-tz";
import { APP_NATIVE_TZ } from "../config";
import ObjectTable from "./ObjectTable.vue";
import { relativeTime } from "./helpers";

const db = getFirestore(firebaseApp);

// The cutoff time for today's check-ins is 00:01 today in APP_NATIVE_TZ.

// Get the current offset for APP_NATIVE_TZ
const app_offset_msec = getTimezoneOffset(APP_NATIVE_TZ);

// Get the current offset for the user's browser
const now = new Date();
const browser_offset_msec = now.getTimezoneOffset() * 60 * 1000;

// Calculate the difference between the two, representing the offset of the
// browser from APP_NATIVE_TZ in milliseconds
const net_offset_msec = app_offset_msec - browser_offset_msec;

const cutoff = new Date();
cutoff.setTime(cutoff.getTime() + net_offset_msec);
cutoff.setHours(0, 1, 0, 0);

export default defineComponent({
  components: { ObjectTable },
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
          where("time", ">", Timestamp.fromDate(cutoff)),
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
    relativeTime,
  },
  computed: {
    // use only the most recent (first) check-in for each user in the list
    filteredItems(): DocumentData[] {
      return Object.values(
        this.items.reduce(
          (res: DocumentData, { uid, location, time, displayName }) => {
            res[uid] ??= { displayName, location, time: relativeTime(time) };
            return res;
          },
          {}
        )
      );
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
