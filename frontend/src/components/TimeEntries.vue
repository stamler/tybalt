<template>
  <div>
    <div class="actions">
      <router-link class="navlink" to="list">List</router-link>
      <router-link class="navlink" to="add">New</router-link>
      <router-link
        v-for="week in Object.keys(this.tallies).map(x => new Date(Number(x)))"
        v-bind:key="week.valueOf()"
        class="navlink"
        v-bind:to="{ name: 'Time Sheets' }"
        v-on:click.native="bundle(week)"
      >
        {{ week.getMonth() + 1 }}/{{ week.getDate() }}
      </router-link>
    </div>
    <router-view />
  </div>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import store from "../store";
import { mapState } from "vuex";
import { format } from "date-fns";

export default {
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
    }
  },
  data() {
    return {
      collection: db.collection("TimeEntries"),
      items: []
    };
  },
  created() {
    this.$bind(
      "items",
      db
        .collection("TimeEntries")
        .where("uid", "==", store.state.user.uid)
        .orderBy("date", "desc")
    ).catch(error => {
      alert(`Can't load Time Entries: ${error.message}`);
    });
  },
  computed: {
    ...mapState(["claims"]),
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
              nonWorkHoursTally: {}, // key is timetype, value is total
              workHoursTally: { hours: 0, jobHours: 0, mealsHours: 0 },
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
            // Tally the work hours
            if ("hours" in item) {
              tallyObject[key].workHoursTally["hours"] += item.hours;
            }
            if ("jobHours" in item) {
              tallyObject[key].workHoursTally["jobHours"] += item.jobHours;
            }
            if ("mealsHours" in item) {
              tallyObject[key].workHoursTally["mealsHours"] += item.mealsHours;
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
    },
    processedItems() {
      return this.items
    }
  }
};
</script>
