<template>
  <reject-modal ref="rejectModal" collectionName="TimeSheets" />
  <share-modal ref="shareModal" collectionName="TimeSheets" />
  <DSList
    v-bind="$attrs"
    v-if="itemsQuery !== null"
    :query="itemsQuery"
    :rowAltVisualFn="altVisual"
  >
    <template #anchor="{ id, weekEnding }">
      <!-- in vue 3.4.24 and later, id has no value. WHY? -->
      <router-link :to="[parentPath, id, 'details'].join('/')">
        {{ shortDate(weekEnding.toDate()) }}
      </router-link>
    </template>
    <template #headline="item">
      <template v-if="content === 'list'">
        {{ hoursWorked(item) }}
      </template>
      <template v-else>
        {{ item.displayName }}
      </template>
    </template>
    <template #byline="item">
      <template v-if="content !== 'list'">
        {{ hoursWorked(item) }}
      </template>
      / {{ hoursOff(item) }} /
      <span v-if="item.offRotationDaysTally > 0">
        {{ item.offRotationDaysTally }} day(s) off rotation
      </span>
      <span v-if="item.bankedHours > 0">
        / {{ item.bankedHours }} hours banked
      </span>
    </template>
    <template #line1="item">{{ jobs(item) }}</template>
    <template #line2="item">{{ divisions(item) }}</template>
    <template #line3="item">
      <span v-if="item.rejected" style="color: red">
        Rejected: {{ item.rejectionReason }}
      </span>
      <span v-if="Object.keys(unreviewed(item)).length > 0">
        Viewers:
        <span
          class="label"
          v-for="(value, uid) in unreviewed(item)"
          v-bind:key="uid"
        >
          {{ value.displayName }}
        </span>
      </span>
      <span v-if="Object.keys(reviewed(item)).length > 0">
        Reviewed:
        <span
          class="label"
          v-for="(value, uid) in reviewed(item)"
          v-bind:key="uid"
        >
          {{ value.displayName }}
        </span>
      </span>
    </template>
    <template #actions="item">
      <template v-if="content === 'list'">
        <template v-if="!item.submitted">
          <action-button type="edit" @click="unbundle(item.id)" />
          <action-button
            v-if="!item.rejected"
            type="send"
            @click="submitTs(item.id)"
          />
        </template>
        <template v-else-if="!item.approved">
          <action-button
            v-if="!item.approved"
            type="recall"
            @click="recallTs(item.id)"
          />
          <span class="label">submitted</span>
        </template>
        <template v-else>
          <span class="label">approved</span>
        </template>
      </template>
      <!-- The template for "pending" -->
      <template v-if="content === 'pending'">
        <template v-if="!item.approved && !item.rejected">
          <action-button
            type="share"
            title="share with another manager"
            @click="shareModal?.openModal(item.id, item.viewerIds)"
          />
          <action-button
            type="delete"
            title="reject this timesheet"
            @click="rejectModal?.openModal(item.id)"
          />
        </template>
        <template v-if="item.rejected">
          <span class="label">rejected</span>
        </template>
      </template>

      <!-- The template for "approved" -->
      <template v-if="content === 'approved'">
        <action-button
          type="share"
          title="share with another manager"
          @click="shareModal?.openModal(item.id, item.viewerIds)"
        />
        <template v-if="!item.locked">
          <action-button
            type="delete"
            title="reject this timesheet"
            @click="rejectModal?.openModal(item.id)"
          />
        </template>
      </template>
      <template v-if="item.locked === true">
        <span class="label">locked</span>
      </template>
    </template>
  </DSList>
</template>

<script setup lang="ts">
import DSList from "./DSList.vue";
import RejectModal from "./RejectModal.vue";
import ShareModal from "./ShareModal.vue";
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  collection,
  DocumentData,
  query,
  where,
  orderBy,
  Query,
} from "firebase/firestore";
import _ from "lodash";
import {
  shortDate,
  isPayrollWeek2,
  recallTs,
  submitTs,
  unbundle,
} from "./helpers";
import ActionButton from "./ActionButton.vue";
import { useStateStore } from "../stores/state";

const props = defineProps({
  content: {
    type: String,
    required: true,
  },
});

const rejectModal = ref<typeof RejectModal | null>(null);
const shareModal = ref<typeof ShareModal | null>(null);
const store = useStateStore();
const user = store.user;
const itemsQuery = ref(null as Query | null);
const route = useRoute();
const parentPath = ref(route?.matched[route.matched.length - 2]?.path ?? "");

const altVisual = function (item: DocumentData) {
  return isPayrollWeek2(item.weekEnding.toDate());
};

// return an object whose keys are uids and values are objects containing
// at least displayName
const unreviewed = function (
  item: DocumentData
): Record<string, { displayName: string }> {
  if (item.viewers) {
    return _.omit(item.viewers, item.reviewedIds);
  } else {
    return {};
  }
};
const reviewed = function (item: DocumentData) {
  if (item.viewers) {
    return _.pick(item.viewers, item.reviewedIds);
  } else {
    return {};
  }
};
const hoursWorked = function (item: DocumentData) {
  let workedHours = 0;
  workedHours += item.workHoursTally.hours;
  workedHours += item.workHoursTally.jobHours;
  if (workedHours > 0) {
    return `${workedHours} hours worked`;
  } else {
    return "no work";
  }
};
const hoursOff = function (item: DocumentData) {
  let hoursOff = 0;
  for (const timetype in item.nonWorkHoursTally) {
    hoursOff += item.nonWorkHoursTally[timetype];
  }
  if (hoursOff > 0) {
    return `${hoursOff} hours off`;
  } else {
    return "no time off";
  }
};
const jobs = function (item: DocumentData) {
  const jobs = Object.keys(item.jobsTally).sort().join(", ");
  if (jobs.length > 0) {
    return `jobs: ${jobs}`;
  } else {
    return;
  }
};
const divisions = function (item: DocumentData) {
  const divisions = Object.keys(item.divisionsTally).sort().join(", ");
  if (divisions.length > 0) {
    return `divisions: ${divisions}`;
  } else {
    return;
  }
};

watch(
  () => props.content,
  (content) => {
    const collectionObject = collection(
      getFirestore(firebaseApp),
      "TimeSheets"
    );
    const uid = user.uid;
    if (uid === undefined) {
      throw "There is no valid uid";
    }

    if (content === "approved") {
      itemsQuery.value = query(
        collectionObject,
        where("managerUid", "==", uid),
        where("approved", "==", true),
        where("submitted", "==", true),
        orderBy("weekEnding", "desc"),
        orderBy("displayName", "asc")
      );
    } else if (content === "pending") {
      // show pending TimeSheets belonging to users that this user manages
      itemsQuery.value = query(
        collectionObject,
        where("managerUid", "==", uid),
        where("approved", "==", false),
        where("submitted", "==", true),
        orderBy("weekEnding", "desc"),
        orderBy("displayName", "asc")
      );
    } else if (content === "list") {
      // show this user's own timesheets
      itemsQuery.value = query(
        collectionObject,
        where("uid", "==", uid),
        orderBy("weekEnding", "desc")
      );
    } else if (content === "shared") {
      // show timesheets shared with this user
      itemsQuery.value = query(
        collectionObject,
        where("viewerIds", "array-contains", uid),
        where("submitted", "==", true),
        orderBy("weekEnding", "desc"),
        orderBy("displayName", "asc")
      );
    }
  },
  { immediate: true }
);
</script>
