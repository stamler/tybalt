// This vue SFC allows us to control the status of job sync and other functions
which aggregate around jobs

<template>
  <div>
    <h1>Jobs Admin</h1>
    <ul>
      <li>
        Fully Recreate Jobs lastTimeEntryDate
        <action-button type="refresh" @click="syncJobs" />
      </li>
      <li>
        Clear Jobs lastTimeEntryDate
        <action-button type="delete" @click="clearLastTimeEntryDate" />
      </li>
    </ul>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { firebaseApp } from "../firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useStateStore } from "../stores/state";
import ActionButton from "./ActionButton.vue";

export default defineComponent({
  setup() {
    const store = useStateStore();
    const { startTask, endTask } = store;
    return { startTask, endTask, claims: store.claims };
  },
  components: {
    ActionButton,
  },
  methods: {
    async syncJobs() {
      const functions = getFunctions(firebaseApp);
      const fullSyncLastTimeEntryDate = httpsCallable(
        functions,
        "fullSyncLastTimeEntryDate"
      );
      this.startTask({
        id: "fullJobsSync",
        message: "updating jobs",
      });
      return fullSyncLastTimeEntryDate()
        .then(() => {
          this.endTask("fullJobsSync");
        })
        .catch((error) => {
          this.endTask("fullJobsSync");
          alert(`Error running full jobs update: ${error}`);
        });
    },
    async clearLastTimeEntryDate() {
      const functions = getFunctions(firebaseApp);
      const clearLastTimeEntryDate = httpsCallable(
        functions,
        "clearLastTimeEntryDate"
      );
      this.startTask({
        id: "clearLastTimeEntryDate",
        message: "clearing dates",
      });
      return clearLastTimeEntryDate()
        .then(() => {
          this.endTask("clearLastTimeEntryDate");
        })
        .catch((error) => {
          this.endTask("clearLastTimeEntryDate");
          alert(`Error Clearing: ${error}`);
        });
    },
  },
});
</script>
