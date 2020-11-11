<template>
  <div id="list">
    <div v-for="week in Object.keys(this.tallies)" v-bind:key="week">
      <span class="listheader">Week ending {{ tallies[week].weekEnding | shortDate }}</span>
      <div class="listentry" v-for="item in itemsByWeekEnding(week)" v-bind:key="item.id">
        <div class="anchorbox">{{ item.date.toDate() | shortDate }}</div>
        <div class="detailsbox">
          <div class="headline_wrapper">
            <div class="headline">
              {{ item.timetype === "R" ? item.divisionName : item.timetypeName }}
            </div>
            <div class="byline"></div>
          </div>
          <div v-if="item.timetype === 'R' && item.job" class="firstline">
            {{ item.job }} - {{ item.jobName }}
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
          <router-link to="#" v-on:click.native="del(item.id)">
            <x-circle-icon></x-circle-icon>
          </router-link>
        </div>
      </div>
      <div class="listsummary">
        <div class="anchorbox">Totals</div>
        <div class="detailsbox">
          <div class="headline_wrapper">
            <div class="headline" v-if="sumValues(week, 'workHoursTally') > 0">
              {{ sumValues(week,"workHoursTally") }} hours worked
            </div>
            <div class="byline" v-if="sumValues(week, 'nonWorkHoursTally') > 0">
              {{ sumValues(week,"nonWorkHoursTally") }} hours off
            </div>
          </div>
          <div class="firstline">
            <span v-if="tallies[week].workHoursTally.jobHours > 0">
              {{ tallies[week].workHoursTally.jobHours }} hours on jobs
            </span>
            <span v-if="tallies[week].workHoursTally.hours > 0">
              {{ tallies[week].workHoursTally.hours }} non-job hours
            </span>
            <span v-if="tallies[week].nonWorkHoursTally.mealsHours > 0">
              {{ tallies[week].nonWorkHoursTally.mealsHours }} hours meals
            </span>
          </div>
            <div class="secondline" v-if="tallies[week].offRotationDates.length > 0">
              {{ tallies[week].offRotationDates.length }} days off rotation
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

<script>
import { format } from "date-fns";
import { EditIcon, XCircleIcon, PackageIcon } from "vue-feather-icons";
import store from "../store";
import firebase from "@/firebase";

export default {
  components: {
    EditIcon,
    XCircleIcon,
    PackageIcon
  },
  filters: {
    shortDate(date) {
      return format(date, "MMM dd");
    },
    hoursString(item) {
      const hoursArray = [];
      if (item.hours) hoursArray.push(item.hours + " hrs");
      if (item.jobHours) hoursArray.push(item.jobHours + " job hrs");
      if (item.mealsHours) hoursArray.push(item.mealsHours + " hrs meals");
      return hoursArray.join(" + ");
    }
  },
  data() {
    return {
      parentPath: null,
      collection: null, // collection: a reference to the parent collection
      items: [],
    };
  },
  created() {
    this.parentPath = this.$route.matched[
      this.$route.matched.length - 1
    ].parent.path;
    this.collection = this.$parent.collection;
    this.$bind(
      "items",
      this.collection
        .where("uid", "==", store.state.user.uid)
        .orderBy("date", "desc")
    ).catch(error => {
      alert(`Can't load Time Entries: ${error.message}`);
    });
  },
  methods: {
    bundle(week) {
      const bundleTimesheet = firebase
        .functions()
        .httpsCallable("bundleTimesheet");
      return bundleTimesheet({ weekEnding: week.getTime() })
        .then(() => {
          alert(
            `Timesheet created for the week ending ${week.getMonth() +
              1}/${week.getDate()}`
          );
        })
        .catch(error => {
          alert(`Error bundling timesheet: ${error.message}`);
        });
    },
    sumValues(week, property) {
      return Object.values(this.tallies[week][property]).reduce((a, c) => a + c, 0);
    },
    itemsByWeekEnding(weekEnding) {
      return this.items
        .filter(x => (x.hasOwnProperty("weekEnding") && x.weekEnding.toDate().valueOf() === Number(weekEnding) ));
    },
    del(item) {
      this.collection
        .doc(item)
        .delete()
        .catch(err => {
          alert(`Error deleting item: ${err}`);
        });
    }
  },
  computed: {
    // A an object where the keys are saturdays and the values are tallies
    // to be used in the UI
    tallies() {
      const tallyObject = {}

      for (const item of this.items) {       
        if (item.hasOwnProperty("weekEnding")) {
          const key = item.weekEnding.toDate().valueOf();
          // this item can be tallied because it has a weekEnding property
          // Check if it already has an entry in the tally object to 
          // accumulate values and create it if not.
          if (!tallyObject.hasOwnProperty(key)) {
            tallyObject[key] = {
              weekEnding: new Date(key),
              offRotationDates: [],
              nonWorkHoursTally: { mealsHours: 0 }, // key is timetype, value is total
              workHoursTally: { hours: 0, jobHours: 0 },
              divisionsTally: {}, // key is division, value is divisionName
              jobsTally: {}, // key is job, value is jobName
            }
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
          } else if (item.timetype !== "R") {
            // Tally the non-work hours
            if (item.timetype in tallyObject[key].nonWorkHoursTally) {
              tallyObject[key].nonWorkHoursTally[item.timetype] += item.hours;
            } else {
              tallyObject[key].nonWorkHoursTally[item.timetype] = item.hours;
            }
          } else {
            // Tally the work hours and meals hours
            if ("hours" in item) {
              tallyObject[key].workHoursTally["hours"] += item.hours;
            }
            if ("jobHours" in item) {
              tallyObject[key].workHoursTally["jobHours"] += item.jobHours;
            }
            if ("mealsHours" in item) {
              tallyObject[key].nonWorkHoursTally["mealsHours"] += item.mealsHours;
            }

            // Tally the divisions (must be present for work hours)
            tallyObject[key].divisionsTally[item.division] = item.divisionName;

            // Tally the jobs (may not be present)
            if ("job" in item) {
              tallyObject[key].jobsTally[item.job] = item.jobName;
            }
          }
        }
      }
      return tallyObject;
    }    
  }
};
</script>
