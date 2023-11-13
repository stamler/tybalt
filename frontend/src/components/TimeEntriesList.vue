<template>
  <div id="list">
    <div>
      <span class="listheader">
        <p style="width: 100%; text-align: right">
          {{ openingOV - usedOV }} hrs Vacation & {{ openingOP - usedOP }} hrs
          PPTO remaining as of {{ shortDate(usedAsOf) }}
        </p>
      </span>
    </div>
    <div v-for="week in Object.keys(tallies)" v-bind:key="week">
      <span class="listheader">
        {{ shortDateWeekDayStart(tallies[week].weekEnding) }} &mdash;
        {{ shortDateWeekDay(tallies[week].weekEnding) }}
      </span>
      <div
        class="listentry"
        v-for="item in itemsByWeekEnding(parseInt(week, 10))"
        v-bind:key="item.id"
        v-bind:class="{ stthsday: dayIsSTThS(item) }"
      >
        <div class="anchorbox">{{ shortDate(item.date.toDate()) }}</div>
        <div class="detailsbox">
          <div class="headline_wrapper">
            <div class="headline" v-if="collectionName === 'TimeEntries'">
              {{
                item.timetype === "R" ? item.divisionName : item.timetypeName
              }}
            </div>
            <div class="headline" v-if="collectionName === 'TimeAmendments'">
              {{ item.displayName }} -
              {{
                item.timetype === "R" ? item.divisionName : item.timetypeName
              }}
              <template
                v-if="
                  collectionName === 'TimeAmendments' &&
                  item.committed &&
                  item.committedWeekEnding
                "
              >
                <span class="label">
                  committed
                  {{ shortDate(item.commitTime.toDate()) }} by
                  {{ item.creatorName }}
                </span>
                <span class="label">
                  posted
                  {{ shortDate(item.committedWeekEnding.toDate()) }}
                </span>
              </template>
            </div>
            <div class="byline" v-if="item.timetype === 'OTO'">
              ${{ item.payoutRequestAmount }}
            </div>
          </div>
          <div
            v-if="['R', 'RT'].includes(item.timetype) && item.job"
            class="firstline"
          >
            {{ item.job }} {{ item.client }}
            <span v-if="item.category" class="label">{{ item.category }}</span>
            : {{ item.jobDescription }}
          </div>
          <div class="secondline">
            {{ hoursString(item) }}
          </div>
          <div v-if="item.workDescription" class="thirdline">
            <span v-if="item.workrecord !== undefined">
              Work Record: {{ item.workrecord }} /
            </span>
            {{ item.workDescription }}
          </div>
        </div>
        <div class="rowactionsbox">
          <template v-if="collectionName === 'TimeAmendments'">
            <template v-if="item.committed === false">
              <action-button type="approve" @click="commit(item)" />
              <router-link
                :to="[parentPath, item.id, 'edit'].join('/')"
                title="edit"
              >
                <Icon icon="feather:edit" width="24px" />
              </router-link>
              <action-button
                type="delete"
                @click="del(item, collectionObject)"
                title="delete"
              />
            </template>
          </template>
          <template v-else>
            <action-button
              type="copy"
              @click="copyEntry(item, collectionObject)"
              title="copy to tomorrow"
            />
            <router-link
              :to="[parentPath, item.id, 'edit'].join('/')"
              title="edit"
            >
              <Icon icon="feather:edit" width="24px" />
            </router-link>
            <action-button
              type="delete"
              @click="del(item, collectionObject)"
              title="delete"
            />
          </template>
        </div>
      </div>
      <div class="listsummary" v-if="collectionName === 'TimeEntries'">
        <div class="anchorbox">Totals</div>
        <div class="detailsbox">
          <div class="headline_wrapper">
            <div class="headline">{{ totalHours(week) }} hours</div>
            <div class="byline">
              {{ tallies[week].workHoursTally.total }} worked /
              {{ tallies[week].nonWorkHoursTally.total }} off
            </div>
          </div>
          <div class="firstline">
            <span v-if="tallies[week].workHoursTally.jobHours > 0">
              {{ tallies[week].workHoursTally.jobHours }} hours on jobs
            </span>
            <span v-if="tallies[week].workHoursTally.hours > 0">
              {{ tallies[week].workHoursTally.hours }} non-job hours
            </span>
            <span v-if="tallies[week].mealsHoursTally > 0">
              {{ tallies[week].mealsHoursTally }} hours meals
            </span>
          </div>
          <div class="secondline">
            <span v-if="tallies[week].offRotationDates.length > 0">
              {{ tallies[week].offRotationDates.length }} day(s) off rotation
            </span>
            <span v-if="tallies[week].offWeek.length > 0">Full Week off</span>
          </div>
          <div class="thirdline">
            <span v-if="tallies[week].bankEntries.length === 1">
              {{ tallies[week].bankEntries[0].hours }} hours banked
            </span>
            <span
              v-else-if="tallies[week].bankEntries.length > 1"
              class="attention"
            >
              More than one banked time entry exists.
            </span>
            <span v-if="tallies[week].payoutRequests.length === 1">
              ${{ tallies[week].payoutRequests[0].payoutRequestAmount }} payout
              requested
            </span>
            <span
              v-else-if="tallies[week].payoutRequests.length > 1"
              class="attention"
            >
              More than one payout request entry exists.
            </span>
          </div>
        </div>
        <div class="rowactionsbox">
          <action-button
            type="send"
            @click="bundle(new Date(Number(week)))"
            title="bundle and submit"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Profile } from "./types";
import { shortDate, copyEntry, del } from "./helpers";
import { format, subDays } from "date-fns";
import ActionButton from "./ActionButton.vue";
import { Icon } from "@iconify/vue";
import { useStateStore } from "../stores/state";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  collection,
  doc,
  CollectionReference,
  query,
  Query,
  where,
  orderBy,
  DocumentData,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useDocument, useCollection } from "vuefire";

// A an object where the keys are saturdays and the values are tallies
// to be used in the UI
interface WeekTally {
  weekEnding: Date;
  bankEntries: DocumentData[];
  payoutRequests: DocumentData[];
  offRotationDates: number[];
  offWeek: number[];
  nonWorkHoursTally: { [timetype: string]: number; total: number };
  mealsHoursTally: number;
  workHoursTally: { hours: number; jobHours: number; total: number };
  divisionsTally: { [division: string]: string }; // value is divisionName
  jobsTally: { [job: string]: { client: string; description: string } };
}

const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp);
const router = useRouter();
const stateStore = useStateStore();
const user = stateStore.user; // TODO: Why we can't use a ref here from storeToRefs
const { startTask, endTask } = stateStore;

const props = defineProps({
  collectionName: {
    type: String,
    required: true,
  },
});
const route = useRoute();
const parentPath = ref("");
const collectionObject = ref(null as CollectionReference | null);
const openingOV = ref(0);
const openingOP = ref(0);
const usedOP = ref(0);
const usedOV = ref(0);
const usedAsOf = ref(new Date());
const profileDoc = useDocument<Profile>(doc(db, "Profiles", user.uid));
const itemsQuery = ref(null as Query | null);
const items = ref([] as DocumentData[]);

onMounted(() => {
  // load the required profile data once the profile document is loaded
  profileDoc.promise.value
    .then(() => {
      const profile = profileDoc.value;
      if (!profile) {
        alert("Can't load profile");
        return;
      }
      openingOV.value = profile.openingOV || 0;
      openingOP.value = profile.openingOP || 0;
      usedOV.value = profile.usedOV || 0;
      usedOP.value = profile.usedOP || 0;
      usedAsOf.value = profile.usedAsOf?.toDate() || new Date();
    })
    .catch((error: unknown) => {
      if (error instanceof Error) {
        alert(`Can't load profile: ${error.message}`);
      } else alert(`Can't load profile: ${JSON.stringify(error)}`);
    });
});

watch(
  () => props.collectionName,
  (collectionName) => {
    // if the collectionName changes, update the parentPath and items

    // if collectionName isn't TimeEntries or TimeAmendments, alert and return
    if (!["TimeEntries", "TimeAmendments"].includes(collectionName)) {
      alert(`Invalid collectionName: ${collectionName}`);
      return;
    }

    collectionObject.value = collection(db, collectionName);
    parentPath.value = route?.matched[route.matched.length - 2]?.path ?? "";
    itemsQuery.value = collection(getFirestore(firebaseApp), collectionName);

    if (collectionName === "TimeEntries") {
      const { promise: tep } = useCollection(
        query(
          collectionObject.value,
          where("uid", "==", user.uid),
          orderBy("date", "desc")
        ),
        { target: items }
      );
      tep.value.catch((error: unknown) => {
        if (error instanceof Error) {
          alert(`Can't load Time Entries: ${error.message}`);
        } else alert(`Can't load Time Entries: ${JSON.stringify(error)}`);
      });
    }
    if (collectionName === "TimeAmendments") {
      const { promise: tap } = useCollection(
        query(collectionObject.value, orderBy("date", "desc")),
        { target: items }
      );
      tap.value.catch((error: unknown) => {
        if (error instanceof Error) {
          alert(`Can't load Time Amendments: ${error.message}`);
        } else alert(`Can't load Time Amendments: ${JSON.stringify(error)}`);
      });
    }
  },
  { immediate: true }
);

const bundle = async function (week: Date) {
  startTask({
    id: "bundle",
    message: "verifying...",
  });
  const bundleTimesheet = httpsCallable(functions, "bundleTimesheet");
  return bundleTimesheet({ weekEnding: week.getTime() })
    .then(() => {
      endTask("bundle");
      router.push({ name: "Time Sheets" });
    })
    .catch((error) => {
      endTask("bundle");
      alert(`Error bundling timesheet: ${error.message}`);
    });
};

const dayIsSTThS = function (item: DocumentData): boolean {
  // return true if day is Sunday, Tuesday, Thursday or Saturday
  if (item.date.toDate().getDay() % 2 === 0) {
    return true;
  }
  return false;
};

const commit = async function (item: DocumentData) {
  const commitTimeAmendment = httpsCallable(functions, "commitTimeAmendment");
  startTask({
    id: `commitAmendment${item.id}`,
    message: "committing",
  });

  return commitTimeAmendment({ id: item.id })
    .then(() => {
      endTask(`commitAmendment${item.id}`);
    })
    .catch((error) => {
      endTask(`commitAmendment${item.id}`);
      alert(`Amendment commit failed: ${error}`);
    });
};

const totalHours = function (week: string): number {
  return (
    tallies.value[week].nonWorkHoursTally.total +
    tallies.value[week].workHoursTally.total
  );
};

const itemsByWeekEnding = function (weekEnding: number) {
  return items.value.filter(
    (x: DocumentData) =>
      Object.prototype.hasOwnProperty.call(x, "weekEnding") &&
      x.weekEnding.toDate().getTime() === Number(weekEnding)
  );
};

const hoursString = function (item: DocumentData) {
  const hoursArray = [];
  if (item.hours) hoursArray.push(item.hours + " hrs");
  if (item.jobHours) hoursArray.push(item.jobHours + " job hrs");
  if (item.mealsHours) hoursArray.push(item.mealsHours + " hrs meals");
  return hoursArray.join(" + ");
};

const shortDateWeekDayStart = function (date: Date) {
  const startDate = subDays(date, 6);
  return format(startDate, "EEE MMM dd");
};
const shortDateWeekDay = function (date: Date) {
  return format(date, "EEE MMM dd");
};

const tallies = computed(() => {
  const tallyObject: { [key: string]: WeekTally } = {};

  for (const item of items.value) {
    if (Object.prototype.hasOwnProperty.call(item, "weekEnding")) {
      const key: string = item.weekEnding.toDate().getTime().toString();
      // this item can be tallied because it has a weekEnding property
      // Check if it already has an entry in the tally object to
      // accumulate values and create it if not.
      if (!Object.prototype.hasOwnProperty.call(tallyObject, key)) {
        tallyObject[key] = {
          weekEnding: new Date(parseInt(key, 10)),
          bankEntries: [],
          payoutRequests: [],
          offRotationDates: [],
          offWeek: [],
          nonWorkHoursTally: { total: 0 }, // key is timetype, value is total
          mealsHoursTally: 0,
          workHoursTally: { hours: 0, jobHours: 0, total: 0 },
          divisionsTally: {}, // key is division, value is divisionName
          jobsTally: {}, // key is job, value is object with client and description
        };
      }

      if (item.timetype === "OR") {
        // Count the off rotation dates and ensure that there are not two
        // off rotation entries for a given date.
        const orDate = new Date(item.date.toDate().setHours(0, 0, 0, 0));
        tallyObject[key].offRotationDates.push(orDate.getTime());
      } else if (item.timetype === "OW") {
        // Count the off dates and ensure that there are not two
        // off entries for a given date.
        const orDate = new Date(item.date.toDate().setHours(0, 0, 0, 0));
        tallyObject[key].offWeek.push(orDate.getTime());
      } else if (item.timetype === "OTO") {
        // This is an request payout entry, store it in the payoutRequests
        // array for processing after completing the tallies.
        tallyObject[key].payoutRequests.push(item);
      } else if (item.timetype === "RB") {
        // This is an overtime bank entry, store it in the bankEntries
        // array for processing after completing the tallies.
        tallyObject[key].bankEntries.push(item);
      } else if (item.timetype === "R" || item.timetype === "RT") {
        // Tally the work hours and meals hours
        if ("hours" in item) {
          tallyObject[key].workHoursTally["hours"] += item.hours;
          tallyObject[key].workHoursTally.total += item.hours;
        }
        if ("jobHours" in item) {
          tallyObject[key].workHoursTally["jobHours"] += item.jobHours;
          tallyObject[key].workHoursTally.total += item.jobHours;
        }
        if ("mealsHours" in item) {
          tallyObject[key].mealsHoursTally += item.mealsHours;
        }

        // Tally the divisions (must be present for work hours)
        tallyObject[key].divisionsTally[item.division] = item.divisionName;

        // Tally the jobs (may not be present)
        if ("job" in item) {
          tallyObject[key].jobsTally[item.job] = {
            client: item.client,
            description: item.jobDescription,
          };
        }
      } else {
        // Tally the non-work hours
        if (item.timetype in tallyObject[key].nonWorkHoursTally) {
          tallyObject[key].nonWorkHoursTally[item.timetype] += item.hours;
        } else {
          tallyObject[key].nonWorkHoursTally[item.timetype] = item.hours;
        }
        tallyObject[key].nonWorkHoursTally.total += item.hours;
      }
    }
  }
  return tallyObject;
});
</script>
<style scoped>
/* sunday, tuesday, thursday and saturday get different background colour */
.stthsday {
  background-color: beige;
}
</style>
