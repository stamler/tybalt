<template>
  <div id="list">
    <div v-for="week in Object.keys(this.tallies)" v-bind:key="week">
      <span class="listheader"
        >Week ending {{ tallies[week].weekEnding | shortDate }}</span
      >
      <div
        class="listentry"
        v-for="item in itemsByWeekEnding(week)"
        v-bind:key="item.id"
      >
        <div class="anchorbox">{{ item.date.toDate() | shortDate }}</div>
        <div class="detailsbox">
          <div class="headline_wrapper">
            <div class="headline">
              {{
                item.timetype === "R" ? item.divisionName : item.timetypeName
              }}
            </div>
            <div class="byline"></div>
          </div>
          <div v-if="item.timetype === 'R' && item.job" class="firstline">
            {{ item.job }} {{ item.client }}: {{ item.jobDescription }}
          </div>
          <div class="secondline">
            {{ item | hoursString }}
          </div>
          <div v-if="item.notes" class="thirdline">
            {{ item.notes }}
          </div>
        </div>
        <div class="rowactionsbox">
          <router-link :to="[parentPath, item.id, 'edit'].join('/')">
            <edit-icon></edit-icon>
          </router-link>
          <router-link to="#" v-on:click.native="del(item, collectionObject)">
            <x-circle-icon></x-circle-icon>
          </router-link>
        </div>
      </div>
      <div class="listsummary">
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
          </div>
        </div>
        <div class="rowactionsbox">
          <router-link
            v-bind:to="{ name: 'Time Sheets' }"
            v-on:click.native="bundle(new Date(Number(week)))"
          >
            <package-icon></package-icon>
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import mixins from "./mixins";
import { format } from "date-fns";
import { EditIcon, XCircleIcon, PackageIcon } from "vue-feather-icons";
import store from "../store";
import { mapState } from "vuex";
import firebase from "../firebase";
const db = firebase.firestore();

export default mixins.extend({
  props: ["collection"],
  components: {
    EditIcon,
    XCircleIcon,
    PackageIcon
  },
  filters: {
    shortDate(date: Date) {
      return format(date, "MMM dd");
    },
    hoursString(item: firebase.firestore.DocumentData) {
      const hoursArray = [];
      if (item.hours) hoursArray.push(item.hours + " hrs");
      if (item.jobHours) hoursArray.push(item.jobHours + " job hrs");
      if (item.mealsHours) hoursArray.push(item.mealsHours + " hrs meals");
      return hoursArray.join(" + ");
    }
  },
  data() {
    return {
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      items: [] as firebase.firestore.DocumentData[]
    };
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    const uid = store.state.user?.uid;
    if (uid === undefined) {
      throw "There is no valid uid";
    }
    this.$bind(
      "items",
      this.collectionObject.where("uid", "==", uid).orderBy("date", "desc")
    ).catch(error => {
      alert(`Can't load Time Entries: ${error.message}`);
    });
  },
  methods: {
    totalHours(week: number): number {
      return (
        this.tallies[week].nonWorkHoursTally.total +
        this.tallies[week].workHoursTally.total
      );
    },
    itemsByWeekEnding(weekEnding: number) {
      return this.items.filter(
        x =>
          Object.prototype.hasOwnProperty.call(x, "weekEnding") &&
          x.weekEnding.toDate().valueOf() === Number(weekEnding)
      );
    }
  },
  computed: {
    ...mapState(["activeTasks", "showTasks"]),

    // A an object where the keys are saturdays and the values are tallies
    // to be used in the UI
    tallies() {
      interface WeekTally {
        weekEnding: Date;
        bankEntries: firebase.firestore.DocumentData[];
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
              offRotationDates: [],
              nonWorkHoursTally: { total: 0 }, // key is timetype, value is total
              mealsHoursTally: 0,
              workHoursTally: { hours: 0, jobHours: 0, total: 0 },
              divisionsTally: {}, // key is division, value is divisionName
              jobsTally: {} // key is job, value is object with client and description
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
                description: item.jobDescription
              };
            }
          } else {
            // Tally the non-work hours
            if (item.timetype in tallyObject[key].nonWorkHoursTally) {
              tallyObject[key].nonWorkHoursTally[item.timetype] += item.hours;
              tallyObject[key].nonWorkHoursTally.total += item.hours;
            } else {
              tallyObject[key].nonWorkHoursTally[item.timetype] = item.hours;
              tallyObject[key].nonWorkHoursTally.total = item.hours;
            }
          }
        }
      }
      return tallyObject;
    }
  }
});
</script>
