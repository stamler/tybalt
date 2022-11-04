<template>
  <div id="list">
    <div id="listbar">
      <input
        id="searchbox"
        type="textbox"
        placeholder="search..."
        v-model="search"
      />
      <span>{{ processedItems.length }} items</span>
    </div>
    <div class="listentry" v-for="item in processedItems" v-bind:key="item.id">
      <div class="anchorbox">{{ item.displayName }}</div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">{{ item.email }}</div>
        </div>
        <div class="firstline">
          {{ keysString(item.customClaims) }}
        </div>
        <div class="secondline">
          <span v-if="item.managerName">Manager: {{ item.managerName }}</span>
          <span v-else class="attention">Missing Manager</span>
        </div>
        <div class="thirdline">
          <span v-if="item.tbtePayrollId">
            /Payroll ID: {{ item.tbtePayrollId }}
          </span>
          <span v-else class="attention"> Missing Payroll ID </span>
          <span v-if="typeof item.salary === 'boolean'">
            /Wage:
            <template v-if="item.salary">salary</template>
            <template v-else>hourly</template>
          </span>
          <span v-if="typeof item.timeSheetExpected === 'boolean'">
            <template v-if="!item.timeSheetExpected">
              /Time Sheet: not expected
            </template>
          </span>
          <span v-else class="attention">timeSheetExpected not specified</span>
          <span v-if="typeof item.untrackedTimeOff === 'boolean'">
            <template v-if="item.untrackedTimeOff">
              /Untracked Time Off
            </template>
          </span>
          <span v-if="item.personalVehicleInsuranceExpiry">
            <template
              v-if="item.personalVehicleInsuranceExpiry.toDate() >= new Date()"
            >
              /vehicle insurance expiry:
              {{ shortDate(item.personalVehicleInsuranceExpiry.toDate()) }}
            </template>
            <span v-else class="attention"> /vehicle insurance expired</span>
          </span>
          <span
            v-if="
              item.doNotAcceptSubmissions && item.customClaims['tapr'] === true
            "
            class="attention"
          >
            /Not Accepting Submissions
          </span>
          <span
            v-if="item.workWeekHours && item.workWeekHours !== 40"
            class="attention"
          >
            /Work Week Hours: {{ item.workWeekHours }}
          </span>
        </div>
      </div>
      <div class="rowactionsbox">
        <router-link :to="[parentPath, item.id, 'edit'].join('/')">
          <edit-icon></edit-icon>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from "vue";
import { shortDate, searchString } from "./helpers";
import firebase from "../firebase";
const db = firebase.firestore();
import { EditIcon } from "vue-feather-icons";

export default Vue.extend({
  props: ["collection"],
  components: {
    EditIcon,
  },
  methods: {
    shortDate,
    keysString(obj: { [key: string]: unknown }): string {
      return obj ? Object.keys(obj).join(", ") : "";
    },
  },
  computed: {
    processedItems(): firebase.firestore.DocumentData[] {
      return this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .filter(
          (p: firebase.firestore.DocumentData) =>
            searchString(p).indexOf(this.search.toLowerCase()) >= 0
        );
    },
  },
  data() {
    return {
      search: "",
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      items: [] as firebase.firestore.DocumentData[],
    };
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
.anchorbox {
  flex-basis: 6.8em;
}
</style>
