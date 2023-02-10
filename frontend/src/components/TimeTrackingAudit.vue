<template>
  <div>
    <h4 v-if="item?.weekEnding">
      Audit TimeTracking for {{ shortDate(weekStart) }} to
      {{ shortDate(item.weekEnding.toDate()) }}
    </h4>
    <template v-if="missingTimeSheets.length > 0">
      <p>The below documents are missing from TimeTracking</p>
      <table>
        <tr>
          <th>Name</th>
          <th>Status</th>
          <th>Update</th>
        </tr>
        <tr v-for="ts in missingTimeSheets" v-bind:key="ts.tsid">
          <td>{{ ts.displayName }}</td>
          <td>{{ ts.status }}</td>
          <td>
            <action-button
              type="refresh"
              @click="updateTimeTracking(ts.tsid)"
            />
          </td>
        </tr>
      </table>
    </template>
  </div>
</template>
<script lang="ts">
import ActionButton from "./ActionButton.vue";
import { firebaseApp } from "../firebase";
import { isMissingTimeSheetRecords, MissingTimeSheetRecord } from "./types";
import { defineComponent } from "vue";
import { shortDate } from "./helpers";
import { subWeeks, addMilliseconds } from "date-fns";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useStateStore } from "../stores/state";
import {
  getFirestore,
  DocumentData,
  doc,
  collection,
} from "firebase/firestore";

const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp);

export default defineComponent({
  setup() {
    const store = useStateStore();
    const { startTask, endTask } = store;
    return { startTask, endTask };
  },
  props: ["id"],
  components: {
    ActionButton,
  },
  computed: {
    weekStart(): Date {
      if (this.item?.weekEnding !== undefined) {
        return addMilliseconds(subWeeks(this.item.weekEnding.toDate(), 1), 1);
      } else {
        return new Date();
      }
    },
  },
  data() {
    return {
      item: {} as DocumentData | undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      missingTimeSheets: [] as MissingTimeSheetRecord[],
    };
  },
  watch: {
    id: function (id: string) {
      this.setItem(id);
      this.audit();
    }, // first arg is newVal, second is oldVal
  },
  created() {
    this.setItem(this.id);
    this.audit();
  },
  methods: {
    shortDate,
    async audit() {
      const id = this.id;
      const auditTimeTracking = httpsCallable(functions, "auditTimeTracking");
      this.startTask({
        id: `audit${id}`,
        message: "auditing TimeTracking...",
      });
      return auditTimeTracking({ id })
        .then((data) => {
          if (isMissingTimeSheetRecords(data.data)) {
            this.missingTimeSheets = data.data;
          } else {
            throw new Error(
              `Unexpected return type from auditTimeTracking: ${JSON.stringify(
                data.data
              )}`
            );
          }
          this.endTask(`audit${id}`);
        })
        .catch((error) => {
          this.endTask(`audit${id}`);
          alert(`Error auditing TimeTracking: ${error.message}`);
        });
    },
    setItem(id: string) {
      this.$firestoreBind(
        "item",
        doc(collection(db, "TimeTracking"), id)
      ).catch((error: unknown) => {
        if (error instanceof Error) {
          alert(`Can't load TimeTracking document ${id}: ${error.message}`);
        } else
          alert(
            `Can't load TimeTracking document ${id}: ${JSON.stringify(error)}`
          );
      });
    },
  },
});
</script>
