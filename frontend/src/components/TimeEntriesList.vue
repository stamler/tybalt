<template>
  <div id="list">
    <div v-for="week in Object.keys(this.tallies)" v-bind:key="week">
      <span class="listheader">
        {{ tallies[week].weekEnding | shortDateWeekDayStart }} &mdash;
        {{ tallies[week].weekEnding | shortDateWeekDay }}
      </span>
      <div
        class="listentry"
        v-for="item in itemsByWeekEnding(week)"
        v-bind:key="item.id"
      >
        <div class="anchorbox">{{ item.date.toDate() | shortDate }}</div>
        <div class="detailsbox">
          <div class="headline_wrapper">
            <div class="headline" v-if="collection === 'TimeEntries'">
              {{
                item.timetype === "R" ? item.divisionName : item.timetypeName
              }}
            </div>
            <div class="headline" v-if="collection === 'TimeAmendments'">
              {{ item.displayName }} -
              {{
                item.timetype === "R" ? item.divisionName : item.timetypeName
              }}
              <template
                v-if="
                  collection === 'TimeAmendments' &&
                  item.committed &&
                  item.committedWeekEnding
                "
              >
                <span class="label">
                  committed
                  {{ item.commitTime.toDate() | shortDate }} by
                  {{ item.creatorName }}
                </span>
                <span class="label">
                  posted
                  {{ item.committedWeekEnding.toDate() | shortDate }}
                </span>
              </template>
            </div>
            <div class="byline" v-if="item.timetype === 'OTO'">
              ${{ item.payoutRequestAmount }}
            </div>
          </div>
          <div v-if="item.timetype === 'R' && item.job" class="firstline">
            {{ item.job }} {{ item.client }}: {{ item.jobDescription }}
          </div>
          <div class="secondline">
            {{ item | hoursString }}
          </div>
          <div v-if="item.workDescription" class="thirdline">
            {{ item.workDescription }}
          </div>
        </div>
        <div class="rowactionsbox">
          <template v-if="collection === 'TimeAmendments'">
            <template v-if="item.committed === false">
              <router-link to="#" v-on:click.native="commit(item)">
                <check-circle-icon></check-circle-icon>
              </router-link>
              <router-link
                :to="[parentPath, item.id, 'edit'].join('/')"
                title="edit"
              >
                <edit-icon></edit-icon>
              </router-link>
              <router-link
                to="#"
                v-on:click.native="del(item, collectionObject)"
                title="delete"
              >
                <x-circle-icon></x-circle-icon>
              </router-link>
            </template>
          </template>
          <template v-else>
            <router-link
              v-if="isMtoTh(item)"
              :to="{ name: 'Time Entries List' }"
              v-on:click.native="copyEntry(item)"
              title="copy to tomorrow"
            >
              <copy-icon></copy-icon>
            </router-link>
            <router-link
              :to="[parentPath, item.id, 'edit'].join('/')"
              title="edit"
            >
              <edit-icon></edit-icon>
            </router-link>
            <router-link
              to="#"
              v-on:click.native="del(item, collectionObject)"
              title="delete"
            >
              <x-circle-icon></x-circle-icon>
            </router-link>
          </template>
        </div>
      </div>
      <div class="listsummary" v-if="collection === 'TimeEntries'">
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
          <div
            class="secondline"
            v-if="tallies[week].offRotationDates.length > 0"
          >
            {{ tallies[week].offRotationDates.length }} day(s) off rotation
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
          <router-link
            v-bind:to="{ name: 'Time Sheets' }"
            v-on:click.native="bundle(new Date(Number(week)))"
            title="bundle and submit"
          >
            <send-icon></send-icon>
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import mixins from "./mixins";
import { format, addDays, subDays } from "date-fns";
import {
  EditIcon,
  XCircleIcon,
  SendIcon,
  CheckCircleIcon,
  CopyIcon,
} from "vue-feather-icons";
import store from "../store";
import { mapState } from "vuex";
import firebase from "../firebase";
const db = firebase.firestore();

export default mixins.extend({
  props: ["collection"],
  components: {
    EditIcon,
    XCircleIcon,
    SendIcon,
    CheckCircleIcon,
    CopyIcon,
  },
  filters: {
    shortDate(date: Date) {
      return format(date, "MMM dd");
    },
    shortDateWeekDay(date: Date) {
      return format(date, "EEE MMM dd");
    },
    shortDateWeekDayStart(date: Date) {
      const startDate = subDays(date, 6);
      return format(startDate, "EEE MMM dd");
    },
    hoursString(item: firebase.firestore.DocumentData) {
      const hoursArray = [];
      if (item.hours) hoursArray.push(item.hours + " hrs");
      if (item.jobHours) hoursArray.push(item.jobHours + " job hrs");
      if (item.mealsHours) hoursArray.push(item.mealsHours + " hrs meals");
      return hoursArray.join(" + ");
    },
  },
  data() {
    return {
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      items: [] as firebase.firestore.DocumentData[],
    };
  },
  watch: {
    collection: {
      immediate: true,
      handler(collection) {
        this.parentPath =
          this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ??
          "";
        this.collectionObject = db.collection(collection);
        this.$bind("items", this.collectionObject);
        const uid = store.state.user?.uid;
        if (uid === undefined) {
          throw "There is no valid uid";
        }
        if (this.collection === "TimeEntries") {
          this.$bind(
            "items",
            this.collectionObject
              .where("uid", "==", uid)
              .orderBy("date", "desc")
          ).catch((error) => {
            alert(`Can't load Time Entries: ${error.message}`);
          });
        }
        if (this.collection === "TimeAmendments") {
          this.$bind(
            "items",
            this.collectionObject.orderBy("date", "desc")
          ).catch((error) => {
            alert(`Can't load Time Amendments: ${error.message}`);
          });
        }
      },
    },
  },
  methods: {
    isMtoTh(item: firebase.firestore.DocumentData) {
      const dayOfWeek = item.date.toDate().getDay();
      // prevent copying to or from weekends in UI
      return dayOfWeek < 5 && dayOfWeek > 0;
    },
    copyEntry(item: firebase.firestore.DocumentData) {
      if (confirm("Want to copy this entry to tomorrow?")) {
        const { date, ...newItem } = item;
        newItem.date = addDays(item.date.toDate(), 1);
        store.commit("startTask", {
          id: `copy${item.id}`,
          message: "copying",
        });
        if (this.collectionObject === null) {
          throw "There is no valid collection object";
        }
        return this.collectionObject
          .add(newItem)
          .then(() => {
            store.commit("endTask", { id: `copy${item.id}` });
          })
          .catch((error) => {
            store.commit("endTask", { id: `copy${item.id}` });
            alert(`Error copying: ${error.message}`);
          });
      }
    },
    commit(item: firebase.firestore.DocumentData) {
      const commitTimeAmendment = firebase
        .functions()
        .httpsCallable("commitTimeAmendment");
      store.commit("startTask", {
        id: `commitAmendment${item.id}`,
        message: "committing",
      });

      return commitTimeAmendment({ id: item.id })
        .then(() => {
          store.commit("endTask", { id: `commitAmendment${item.id}` });
        })
        .catch((error) => {
          store.commit("endTask", { id: `commitAmendment${item.id}` });
          alert(`Amendment commit failed: ${error}`);
        });
    },
    totalHours(week: number): number {
      return (
        this.tallies[week].nonWorkHoursTally.total +
        this.tallies[week].workHoursTally.total
      );
    },
    itemsByWeekEnding(weekEnding: number) {
      return this.items.filter(
        (x) =>
          Object.prototype.hasOwnProperty.call(x, "weekEnding") &&
          x.weekEnding.toDate().valueOf() === Number(weekEnding)
      );
    },
  },
  computed: {
    ...mapState(["activeTasks", "showTasks"]),

    // A an object where the keys are saturdays and the values are tallies
    // to be used in the UI
    tallies() {
      interface WeekTally {
        weekEnding: Date;
        bankEntries: firebase.firestore.DocumentData[];
        payoutRequests: firebase.firestore.DocumentData[];
        offRotationDates: number[];
        nonWorkHoursTally: { [timetype: string]: number; total: number };
        mealsHoursTally: number;
        workHoursTally: { hours: number; jobHours: number; total: number };
        divisionsTally: { [division: string]: string }; // value is divisionName
        jobsTally: { [job: string]: { client: string; description: string } };
      }

      const tallyObject: { [key: number]: WeekTally } = {};

      for (const item of this.items) {
        if (Object.prototype.hasOwnProperty.call(item, "weekEnding")) {
          const key = item.weekEnding.toDate().valueOf();
          // this item can be tallied because it has a weekEnding property
          // Check if it already has an entry in the tally object to
          // accumulate values and create it if not.
          if (!Object.prototype.hasOwnProperty.call(tallyObject, key)) {
            tallyObject[key] = {
              weekEnding: new Date(key),
              bankEntries: [],
              payoutRequests: [],
              offRotationDates: [],
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
            if (tallyObject[key].offRotationDates.includes(orDate.getTime())) {
              throw new Error(
                "More than one Off-Rotation entry exists for" +
                  format(orDate, "yyyy MMM dd")
              );
            } else {
              tallyObject[key].offRotationDates.push(orDate.getTime());
            }
          } else if (item.timetype === "OTO") {
            // This is an request payout entry, store it in the payoutRequests
            // array for processing after completing the tallies.
            tallyObject[key].payoutRequests.push(item);
          } else if (item.timetype === "RB") {
            // This is an overtime bank entry, store it in the bankEntries
            // array for processing after completing the tallies.
            tallyObject[key].bankEntries.push(item);
          } else if (item.timetype === "R") {
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
