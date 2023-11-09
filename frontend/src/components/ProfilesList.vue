<template>
  <DSList
    v-if="query !== null"
    :query="itemsQuery"
    :search="true"
    class="lwrapper"
  >
    <template #anchor="{ displayName }">{{ displayName }}</template>
    <template #headline="{ email }">{{ email }}</template>
    <template #line1="{ customClaims }">
      {{ keysString(customClaims) }}
    </template>
    <template #line2="{ managerName }">
      <span v-if="managerName">Manager: {{ managerName }}</span>
      <span v-else class="attention">Missing Manager</span>
    </template>
    <template #line3="item">
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
        <template v-if="item.untrackedTimeOff"> /Untracked Time Off </template>
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
        v-if="item.doNotAcceptSubmissions && item.customClaims['tapr'] === true"
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
    </template>
    <template #actions="{ id }">
      <router-link :to="[parentPath, id, 'edit'].join('/')">
        <Icon icon="feather:edit" width="24px" />
      </router-link>
    </template>
  </DSList>
</template>

<script setup lang="ts">
import DSList from "./DSList.vue";
import { ref } from "vue";
import { useRoute } from "vue-router";
import { shortDate } from "./helpers";
import { firebaseApp } from "../firebase";
import { getFirestore, collection, query, orderBy } from "firebase/firestore";
import { Icon } from "@iconify/vue";

const route = useRoute();
const parentPath = ref(route?.matched[route.matched.length - 2]?.path ?? "");
const itemsQuery = ref(
  query(collection(getFirestore(firebaseApp), "Profiles"), orderBy("surname"))
);

const keysString = function (obj: { [key: string]: unknown }): string {
  return obj ? Object.keys(obj).sort().join(", ") : "";
};
</script>
<style scoped>
.lwrapper :deep(.anchorbox) {
  flex-basis: 6.8em;
}
</style>
