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
          <span v-if="item.payrollId"> /Payroll ID: {{ item.payrollId }} </span>
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
            <template v-if="item.defaultChargeOutRate !== undefined">
              /Charge-out Rate: {{ item.defaultChargeOutRate }}
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
            <span v-else class="attention"> /vehicle insurance: expired</span>
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
          <Icon icon="feather:edit" width="24px" />
        </router-link>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { shortDate, searchString } from "./helpers";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  collection,
  CollectionReference,
  DocumentData,
  query,
  orderBy,
} from "firebase/firestore";
const db = getFirestore(firebaseApp);
import { Icon } from "@iconify/vue";

export default defineComponent({
  props: ["collectionName"],
  components: {
    Icon,
  },
  methods: {
    shortDate,
    keysString(obj: { [key: string]: unknown }): string {
      return obj ? Object.keys(obj).join(", ") : "";
    },
  },
  computed: {
    processedItems(): DocumentData[] {
      return this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .filter(
          (p: DocumentData) =>
            searchString(p).indexOf(this.search.toLowerCase()) >= 0
        );
    },
  },
  data() {
    return {
      search: "",
      parentPath: "",
      collectionObject: null as CollectionReference | null,
      items: [] as DocumentData[],
    };
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
.anchorbox {
  flex-basis: 6.8em;
}
</style>
