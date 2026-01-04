<template>
  <div id="editor">
    <p v-if="!timeEnabled">
      Please use <a href="https://turbo.tbte.ca/time/entries/add" target="_blank">tybalt turbo</a> to track your time.
    </p>
    <form v-if="timeEnabled">
    <span class="field" v-if="collectionName === 'TimeAmendments'">
      <select class="grow" name="uid" v-model="item.uid">
        <option disabled selected value="">-- choose an employee --</option>
        <option v-for="p in profiles" :value="p.id" v-bind:key="p.id">
          {{ p.displayName }}
        </option>
      </select>
    </span>
    <datepicker
      name="datepicker"
      placeholder="Date"
      :auto-apply="true"
      :min-date="dps.disabled.to"
      :max-date="dps.disabled.from"
      :highlight="dps.highlight"
      :enable-time-picker="false"
      :format="shortDateWithWeekday"
      hide-input-icon
      input-class-name="field"
      week-start="0"
      v-model="item.date"
    />
    <span class="field">
      <select class="grow" name="timetype" v-model="item.timetype">
        <option v-for="t in timetypes" :value="t.id" v-bind:key="t.id">
          {{ t.id }} - {{ t.name }}
        </option>
      </select>
    </span>
    <span v-if="trainingTokensInDescriptionWhileRegularHours" class="attention">
      ^Should you choose training instead?
    </span>

    <!----------------------------------------------->
    <!-- FIELDS VISIBLE ONLY FOR R or RT TimeTypes -->
    <!----------------------------------------------->
    <span v-show="['R', 'RT'].includes(item.timetype)">
      <span class="field">
        <select class="grow" name="division" v-model="item.division">
          <option disabled selected value="">-- choose division --</option>
          <option v-for="d in divisions" :value="d.id" v-bind:key="d.id">
            {{ d.id }} - {{ d.name }}
          </option>
        </select>
      </span>
      <DSJobSelector v-model="item"/>
      <span class="field" v-if="item.job && item.job !== '' && item.division">
        <label for="jobHours">Job Hours</label>
        <input
          class="grow"
          type="number"
          name="jobHours"
          v-model.number="item.jobHours"
          step="0.5"
          min="0"
          max="18"
        />
      </span>
    </span>

    <!--------------------------------------------------->
    <!-- END FIELDS VISIBLE ONLY FOR R or RT TimeTypes -->
    <!--------------------------------------------------->

    <span
      class="field"
      v-if="!['OR', 'OW', 'OTO'].includes(item.timetype) && item.job === undefined"
    >
      <label for="hours">
        {{
          item.job &&
          item.job !== "" &&
          item.division &&
          ["R", "RT"].includes(item.timetype)
            ? "Non-Chargeable "
            : ""
        }}Hours
      </label>
      <input
        class="grow"
        type="number"
        name="hours"
        v-model.number="item.hours"
        step="0.5"
        min="0"
        max="18"
      />
    </span>

    <span
      class="field"
      v-if="item.division && ['R', 'RT'].includes(item.timetype)"
    >
      <label for="mealsHours">Meals Hours</label>
      <input
        class="grow"
        type="number"
        name="mealsHours"
        v-model.number="item.mealsHours"
        step="0.5"
        min="0"
        max="2"
      />
    </span>

    <span
      class="field"
      v-if="
        item.job &&
        item.job !== '' &&
        item.division &&
        ['R', 'RT'].includes(item.timetype)
      "
    >
      <label for="workrecord">Work Record</label>
      <input
        class="grow"
        type="text"
        name="workrecord"
        placeholder="Work Record"
        v-model.trim="item.workrecord"
      />
    </span>

    <span
      class="field"
      v-if="!['OR', 'OW', 'OTO', 'RB'].includes(item.timetype)"
    >
      <input
        class="grow"
        type="text"
        name="workDescription"
        placeholder="Work Description (5 char minimum)"
        v-model.trim="item.workDescription"
      />
    </span>
    <span v-if="jobNumbersInDescription" class="attention">
      Job numbers are not allowed in the work description. Enter jobs numbers in
      the appropriate field and create one time entry per job.
    </span>
    <span class="field" v-if="item.timetype === 'OTO'">
      $<input
        class="grow"
        type="number"
        name="payoutRequestAmount"
        placeholder="Amount"
        v-model.number="item.payoutRequestAmount"
        step="0.01"
      />
    </span>

    <span class="field">
      <button type="button" v-on:click="save()" v-if="!jobNumbersInDescription">
        Save
      </button>
      <button type="button" v-on:click="$router.push(parentPath)">
        Cancel
      </button>
    </span>
  </form>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { firebaseApp } from "../firebase";
import { useCollection } from "vuefire";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  DocumentSnapshot,
  DocumentData,
  serverTimestamp,
} from "firebase/firestore";
const db = getFirestore(firebaseApp);
import { useStateStore } from "../stores/state";
import { storeToRefs } from "pinia";
import Datepicker from "@vuepic/vue-datepicker";
import { addWeeks, subWeeks } from "date-fns";
import { shortDateWithWeekday } from "./helpers";
import _ from "lodash";
import DSJobSelector from "./DSJobSelector.vue";

const route = useRoute();
const router = useRouter();
const parentPath = ref(route?.matched[route.matched.length - 2]?.path ?? "");

const store = useStateStore();
const { user, timeEnabled } = storeToRefs(store);

const props = defineProps({
  id: {
    // https://vuejs.org/api/utility-types.html#proptype-t
    type: String,
    required: false,
  },
  collectionName: {
    type: String,
    required: true,
  },
});

const dps = {
  // date picker state
  disabled: {
    to: subWeeks(new Date(), 12),
    from: addWeeks(new Date(), 4),
  },
  highlight: {
    dates: [new Date()],
  },
};

const collectionObject = collection(db, props.collectionName);
const divisions = useCollection(collection(db, "Divisions"));
const timetypes = useCollection(collection(db, "TimeTypes"));
const profiles = useCollection(collection(db, "Profiles"));
const item = ref({} as DocumentData);

const trainingTokensInDescriptionWhileRegularHours = computed(() => {
  if (
    item.value.timetype !== undefined &&
    item.value.workDescription !== undefined
  ) {
    const lowercase = item.value.workDescription.toLowerCase().trim();
    const lowercaseTokens = lowercase.split(/\s+/);
    return (
      item.value.timetype === "R" &&
      ([
        "training",
        "train",
        "orientation",
        "course",
        "whmis",
        "learning",
      ].some((token) => lowercaseTokens.includes(token)) ||
        ["working at heights", "first aid"].some((token) =>
          lowercase.includes(token)
        ))
    );
  }
  return false;
});

const jobNumbersInDescription = computed(() => {
  if (item.value.workDescription !== undefined) {
    const lowercase = item.value.workDescription.toLowerCase().trim();
    // look for any instances of XX-YYY where XX is a number between 15 and
    // 40 and YYY is a zero-padded number between 1 and 999 then return true
    // if any are found
    return /(1[5-9]|2[0-9]|3[0-9]|40)-(\d{3})/.test(lowercase);
  }
  return false;
});

watch(
  () => props.id,
  (id) => {
    setItem(id);
  }
);

watch(
  () => item.value.timetype,
  (newVal, oldVal) => {
    if (["R", "RT"].includes(newVal) && !["R", "RT"].includes(oldVal)) {
      // The time type has just been changed to R or RT, verify division set
      if (item.value.division === undefined) {
        item.value.division = "";
      }
    }
    if (!["R", "RT"].includes(newVal) && ["R", "RT"].includes(oldVal)) {
      // The time type has just been changed from R or RT, set division
      // and job to undefined
      item.value.division = undefined;
      item.value.job = undefined;
    }
  }
);

const setItem = async function (id: string | undefined) {
  if (id) {
    getDoc(doc(collectionObject, id))
      .then((snap: DocumentSnapshot) => {
        const result = snap.data();
        if (result === undefined) {
          // A document with this id doesn't exist in the database,
          // list instead.
          router.push(parentPath.value);
        } else {
          item.value = result;
          item.value.date = result.date.toDate();
        }
      })
      .catch(() => {
        router.push(parentPath.value);
      });
  } else {
    const profile = await getDoc(doc(db, "Profiles", user.value.uid));
    const defaultDivision = profile.get("defaultDivision");
    item.value = {
      date: new Date(),
      timetype: "R",
      division: defaultDivision ?? "",
    };
    if (props.collectionName === "TimeAmendments") {
      // setting the uid blank surfaces the choose option in the UI
      item.value.uid = "";
    }
  }
};

const save = function () {
  // Populate the Time Type Name
  item.value.timetypeName = timetypes.value.filter(
    (i: DocumentData) => i.id === item.value.timetype
  )[0].name;

  // if timetype isn't R or RT, delete disallowed properties
  if (!["R", "RT"].includes(item.value.timetype)) {
    [
      "division",
      "divisionName",
      "job",
      "jobDescription",
      "client",
      "jobHours",
      "mealsHours",
      "workrecord",
    ].forEach((x) => delete item.value[x]);
  } else {
    // timetype is R or RT, division must be present
    if (item.value.division && item.value.division.length > 0) {
      // write divisionName
      item.value.divisionName = divisions.value.filter(
        (i: DocumentData) => i.id === item.value.division
      )[0].name;
    } else {
      throw "Division Missing";
    }

    // TODO: catch the above throw and notify the user.
    // TODO: build more validation here to notify the user of errors
    // before hitting the backend.

    // remove values of zero in hours fields
    if (item.value.mealsHours === 0) {
      delete item.value.mealsHours;
    }

    if (item.value.jobHours === 0) {
      delete item.value.jobHours;
    }

    if (item.value.hours === 0) {
      delete item.value.hours;
    }

    delete item.value.payoutRequestAmount;

    // Clear the Job if it's empty or too short, otherwise clear hours
    // since we don't allow non-chargeable time with a job number
    // The back end will actually validate that it exists
    if (!item.value.job || item.value.job.length < 6) {
      // Clear
      delete item.value.job;
      delete item.value.client;
      delete item.value.jobDescription;
      delete item.value.jobHours;
      delete item.value.workorder;
    } else {
      delete item.value.hours;
    }
  }

  // if timetype is OW, OR or OTO, delete hours and workDescription
  // (other properties already deleted in previous if/else statement)
  if (["OR", "OW", "OTO"].includes(item.value.timetype)) {
    delete item.value.hours;
    delete item.value.workDescription;
  }

  // delete payoutRequestAmount if it's not a payout request
  if (item.value.timetype !== "OTO") {
    delete item.value.payoutRequestAmount;
  }

  item.value = _.pickBy(item.value, (i) => i !== ""); // strip blank fields

  if (props.collectionName === "TimeEntries") {
    // include uid of the creating user
    item.value.uid = user.value.uid;
  }

  if (!Object.prototype.hasOwnProperty.call(item.value, "date")) {
    // make the date today if not provided by user
    item.value.date = new Date();
  }

  // If we're creating an Amendment rather than a TimeEntry, add a creator
  // and creator name, set the displayName from the uid given in the UI,
  // and add a sentinel for the server timestamp
  if (props.collectionName === "TimeAmendments") {
    try {
      // Populate the displayName, surname & givenName
      const profile = profiles.value.filter(
        (i: DocumentData) => i.id === item.value.uid
      )[0];
      item.value.displayName = profile.displayName;
      item.value.surname = profile.surname;
      item.value.givenName = profile.givenName;
    } catch {
      alert("Specify an employee");
    }

    item.value.creator = user.value.uid;
    item.value.creatorName = user.value.displayName;
    item.value.created = serverTimestamp();
    item.value.committed = false;
  }

  // Write to database
  if (props.id) {
    // Editing an existing item
    setDoc(doc(collectionObject, props.id), item.value)
      .then(() => {
        router.push(parentPath.value);
      })
      .catch((error: unknown) => {
        if (error instanceof Error) {
          alert(`Failed to edit Time Entry: ${error.message}`);
        } else alert(`Failed to edit Time Entry: ${JSON.stringify(error)}`);
      });
  } else {
    // Creating a new item
    setDoc(doc(collectionObject), item.value)
      .then(() => {
        router.push(parentPath.value);
      })
      .catch((error: unknown) => {
        if (error instanceof Error) {
          alert(`Failed to create Time Entry: ${error.message}`);
        } else
          alert(`Failed to create Time Entry: ${JSON.stringify(error)}`);
      });
  }
};

setItem(props.id);
</script>