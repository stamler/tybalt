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
        {{ item.tbtePayrollId }}
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">
            Opening:
            {{ item.openingDateTimeOff | fullDetailDate }}
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
          <span v-if="item.openingOV > 0" style="margin-left: 0.5em">
            <span class="labels">
              used: {{ item.usedOV }} hrs to {{ item.usedAsOf | shortDate }}
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
          <span v-if="item.openingOV > 0" style="margin-left: 0.5em">
            <span class="labels">
              used: {{ item.usedOP }} hrs to {{ item.usedAsOf | shortDate }}
            </span>
            <span class="labels">
              balance: {{ item.openingOP - item.usedOP }}
            </span>
          </span>
        </span>
      </div>
      <div class="rowactionsbox">
        <save-box :item="item" :newOpeningDate="newOpeningDate"></save-box>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from "vue";
import SaveBox from "./SaveBox.vue";
import firebase from "../firebase";
import { format } from "date-fns";
import { payPeriodsForYear as ppGen } from "./helpers";
const db = firebase.firestore();

export default Vue.extend({
  components: { SaveBox },
  props: ["collection"],
  data() {
    return {
      newOpeningDate: undefined as Date | undefined,
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      items: [] as firebase.firestore.DocumentData[],
    };
  },
  computed: {
    openingDateCandidates(): Date[] {
      return Array.from(ppGen(new Date().getFullYear()));
    },
  },
  filters: {
    fullDetailDate(date: firebase.firestore.Timestamp): string {
      if (date) return format(date.toDate(), "yyyy MMM dd @ HH:mm:ss.SSS");
      else return "";
    },
    shortDate(date: firebase.firestore.Timestamp | undefined | null): string {
      if (date === undefined || date === null) return "";
      return format(date.toDate(), "MMM dd");
    },
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.$bind("items", this.collectionObject.orderBy("surname")).catch(
      (error: unknown) => {
        if (error instanceof Error) {
          alert(`Can't load Profiles: ${error.message}`);
        } else alert(`Can't load Profiles: ${JSON.stringify(error)}`);
      }
    );
  },
});
</script>
<style scoped>
.labels {
  display: inline-block;
  width: 12em;
}
</style>
