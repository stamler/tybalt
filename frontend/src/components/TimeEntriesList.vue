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

<script lang="ts">
import { defineComponent } from "vue";
import { shortDate, copyEntry, del } from "./helpers";
import { format, subDays } from "date-fns";
import ActionButton from "./ActionButton.vue";
import { Icon } from "@iconify/vue";
import { storeToRefs } from "pinia";
import { useStateStore } from "../stores/state";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  CollectionReference,
  query,
  where,
  orderBy,
  DocumentData,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp);

export default defineComponent({
  setup: () => {
    const stateStore = useStateStore();
    const user = stateStore.user; // TODO: Why we can't use a ref here from storeToRefs
    const { activeTasks, showTasks } = storeToRefs(stateStore);
    const { startTask, endTask } = stateStore;
    return { activeTasks, showTasks, user, startTask, endTask };
  },
  props: ["collectionName"],
  components: {
    ActionButton,
    Icon,
  },
  data() {
    return {
      parentPath: "",
      collectionObject: null as CollectionReference | null,
      items: [] as DocumentData[],
      openingOV: 0,
      openingOP: 0,
      usedOP: 0,
      usedOV: 0,
      usedAsOf: new Date(),
    };
  },
  watch: {
    collectionName: {
      immediate: true,
      handler(collectionName) {
        this.parentPath =
          this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
        this.collectionObject = collection(db, collectionName);
        // this.$firestoreBind("items", this.collectionObject);
        const uid = this.user.uid;
        if (uid === undefined) {
          throw "There is no valid uid";
        }
        getDoc(doc(db, "Profiles", uid))
          .then((docSnap) => {
            this.openingOV = docSnap.get("openingOV") || 0;
            this.openingOP = docSnap.get("openingOP") || 0;
            this.usedOV = docSnap.get("usedOV") || 0;
            this.usedOP = docSnap.get("usedOP") || 0;
            this.usedAsOf = docSnap.get("usedAsOf")?.toDate() || new Date();
          })
          .catch((error: unknown) => {
            if (error instanceof Error) {
              alert(`Error loading profile: ${error.message}`);
            } else alert(`Error loading profile: ${JSON.stringify(error)}`);
          });
        if (this.collectionName === "TimeEntries") {
          this.$firestoreBind(
            "items",
            query(
              this.collectionObject,
              where("uid", "==", uid),
              orderBy("date", "desc")
            )
          ).catch((error: unknown) => {
            if (error instanceof Error) {
              alert(`Can't load Time Entries: ${error.message}`);
            } else alert(`Can't load Time Entries: ${JSON.stringify(error)}`);
          });
        }
        if (this.collectionName === "TimeAmendments") {
          this.$firestoreBind(
            "items",
            query(this.collectionObject, orderBy("date", "desc"))
          ).catch((error: unknown) => {
            if (error instanceof Error) {
              alert(`Can't load Time Amendments: ${error.message}`);
            } else
              alert(`Can't load Time Amendments: ${JSON.stringify(error)}`);
          });
        }
      },
    },
  },
  methods: {
    bundle(week: Date) {
      this.startTask({
        id: "bundle",
        message: "verifying...",
      });
      const bundleTimesheet = httpsCallable(functions, "bundleTimesheet");
      return bundleTimesheet({ weekEnding: week.getTime() })
        .then(() => {
          this.endTask("bundle");
          this.$router.push({ name: "Time Sheets" });
        })
        .catch((error) => {
          this.endTask("bundle");
          alert(`Error bundling timesheet: ${error.message}`);
        });
    },
    copyEntry,
    del,
    dayIsSTThS(item: DocumentData): boolean {
      // return true if day is Sunday, Tuesday, Thursday or Saturday
      if (item.date.toDate().getDay() % 2 === 0) {
        return true;
      }
      return false;
    },
    commit(item: DocumentData) {
      const commitTimeAmendment = httpsCallable(
        functions,
        "commitTimeAmendment"
      );
      this.startTask({
        id: `commitAmendment${item.id}`,
        message: "committing",
      });

      return commitTimeAmendment({ id: item.id })
        .then(() => {
          this.endTask(`commitAmendment${item.id}`);
        })
        .catch((error) => {
          this.endTask(`commitAmendment${item.id}`);
          alert(`Amendment commit failed: ${error}`);
        });
    },
    totalHours(week: string): number {
      return (
        this.tallies[week].nonWorkHoursTally.total +
        this.tallies[week].workHoursTally.total
      );
    },
    itemsByWeekEnding(weekEnding: number) {
      return this.items.filter(
        (x: DocumentData) =>
          Object.prototype.hasOwnProperty.call(x, "weekEnding") &&
          x.weekEnding.toDate().getTime() === Number(weekEnding)
      );
    },
    hoursString(item: DocumentData) {
      const hoursArray = [];
      if (item.hours) hoursArray.push(item.hours + " hrs");
      if (item.jobHours) hoursArray.push(item.jobHours + " job hrs");
      if (item.mealsHours) hoursArray.push(item.mealsHours + " hrs meals");
      return hoursArray.join(" + ");
    },
    shortDateWeekDayStart(date: Date) {
      const startDate = subDays(date, 6);
      return format(startDate, "EEE MMM dd");
    },
    shortDateWeekDay(date: Date) {
      return format(date, "EEE MMM dd");
    },
    shortDate,
  },
  computed: {
    // A an object where the keys are saturdays and the values are tallies
    // to be used in the UI
    tallies() {
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

      const tallyObject: { [key: string]: WeekTally } = {};

      for (const item of this.items) {
        if (Object.prototype.hasOwnProperty.call(item, "weekEnding")) {
          const key: string = item.weekEnding.toDate().getTime().toString();
          // this item can be tallied because it has a weekEnding property
          // Check if it already has an entry in the tally object to
          // accumulate values and create it if not.
          if (!Object.prototype.hasOwnProperty.call(tallyObject, key)) {
            tallyObject[key] = {
              weekEnding: new Date(key),
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
    },
  },
});
</script>
<style scoped>
/* sunday, tuesday, thursday and saturday get different background colour */
.stthsday {
  background-color: beige;
}
</style>
