<template>
  <div id="list">
    <div id="listbar">
      <span>Replacement Opening Date</span>
      <select name="newOpeningDate" v-model="newOpeningDate">
        <option disabled selected value="">
          -- choose prior pay period --
        </option>
        <option
          v-for="(d, idx) in openingDateCandidates"
          :value="d"
          v-bind:key="idx"
        >
          {{ d }}
        </option>
      </select>
    </div>
    <div class="listentry" v-for="item in items" v-bind:key="item.id">
      <div class="anchorbox">
        {{ item.displayName }}
        {{ item.payrollId }}
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">
            Opening:
            {{ fullDetailDate(item.openingDateTimeOff) }}
          </div>
        </div>
        <span class="field">
          <label class="labels" for="openingOV">Opening Vacation Hours:</label>
          <span class="label" v-if="typeof item.openingOV !== 'number'">
            missing
          </span>
          <input
            style="width: 5em; display: inline"
            type="number"
            name="openingOV"
            v-model.number="item.openingOV"
            step="0.01"
            min="0"
            max="240"
            placeholder="123.45"
          />
          <span v-if="item.openingOV >= 0" style="margin-left: 0.5em">
            <span class="labels" v-if="item.usedOV">
              used: {{ item.usedOV }} hrs to
              {{ shortDate(item.usedAsOf.toDate()) }}
            </span>
            <span class="labels">
              balance: {{ item.openingOV - item.usedOV }}
            </span>
          </span>
        </span>
        <span>
          <label class="labels" for="openingOP">Opening PPTO Hours:</label>
          <span class="label" v-if="typeof item.openingOP !== 'number'">
            missing
          </span>
          <input
            style="width: 5em; display: inline"
            type="number"
            name="openingOP"
            v-model.number="item.openingOP"
            step="0.5"
            min="48"
            max="332"
            placeholder="48"
          />
          <span v-if="item.openingOP >= 0" style="margin-left: 0.5em">
            <span class="labels" v-if="item.usedOP">
              used: {{ item.usedOP }} hrs to
              {{ shortDate(item.usedAsOf.toDate()) }}
            </span>
            <span class="labels">
              balance: {{ item.openingOP - item.usedOP }}
            </span>
          </span>
        </span>
      </div>
      <div class="rowactionsbox">
        <save-box v-bind:item="item" v-bind:newOpeningDate="newOpeningDate" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import SaveBox from "./SaveBox.vue";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  collection,
  CollectionReference,
  DocumentData,
  query,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { format } from "date-fns";
import { shortDate, payPeriodsForYear as ppGen } from "./helpers";
const db = getFirestore(firebaseApp);

export default defineComponent({
  components: { SaveBox },
  props: ["collectionName"],
  data() {
    return {
      newOpeningDate: undefined as Date | undefined,
      parentPath: "",
      collectionObject: null as CollectionReference | null,
      items: [] as DocumentData[],
    };
  },
  methods: {
    shortDate,
    fullDetailDate(date: Timestamp): string {
      if (date) return format(date.toDate(), "yyyy MMM dd @ HH:mm:ss.SSS");
      else return "";
    },
  },
  computed: {
    openingDateCandidates(): Date[] {
      return Array.from(ppGen(new Date().getFullYear()));
    },
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
    this.collectionObject = collection(db, this.collectionName);
    this.$firestoreBind(
      "items",
      query(this.collectionObject, orderBy("surname"))
    ).catch((error: unknown) => {
      if (error instanceof Error) {
        alert(`Can't load Profiles: ${error.message}`);
      } else alert(`Can't load Profiles: ${JSON.stringify(error)}`);
    });
  },
});
</script>
<style scoped>
.labels {
  display: inline-block;
  width: 12em;
}
</style>
