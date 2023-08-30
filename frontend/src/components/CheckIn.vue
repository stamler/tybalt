<template>
  <div>
    <div id="dash">
      <div class="infobox" v-if="item">
        <p>
          You were at {{ item.location }}
          {{ relativeTime(item.location_time) }}
        </p>
        <h2>Where are you now?</h2>

        <div v-for="key in locations" v-bind:key="key">
          <action-button @click="submitCheckIn(key)">
            {{ key }}
          </action-button>
        </div>
        <div>
          <input type="text" name="field" v-model="field" placeholder="Field (specify)" />
          <action-button
            v-if="field.length > 1"
            type="send"
            @click="submitCheckIn(field)"
          />
        </div>
        <div>
          <input type="text" name="other" v-model="other" placeholder="Other" />
          <action-button
            v-if="other.length > 1"
            type="send"
            @click="submitCheckIn(other)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { firebaseApp } from "../firebase";
import { getFirestore, doc, DocumentData, Timestamp } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import ActionButton from "./ActionButton.vue";
import { useDocument } from "vuefire";
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
      field: "",
      other: "",
      item: useDocument(
        doc(db, "Profiles", (this.user as unknown as DocumentData).uid)
      ),
      locations: [
        "Home",
        "Yonge St",
        "Quebec St",
        "Kingston St",
        "Lab",
        "Fort Frances",
      ],
    };
  },
  components: { ActionButton },
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
