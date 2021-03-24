<template>
  <div id="list">
    <div class="listentry" v-for="item in processedItems" v-bind:key="item.id">
      <div class="anchorbox">
        <router-link :to="[parentPath, item.id, 'details'].join('/')">
          {{ item.weekEnding.toDate() | exportDate }}
        </router-link>
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline"></div>
          <div class="byline"></div>
        </div>
        <div class="firstline" v-if="hasPending(item)">
          {{ Object.keys(item.pending).length }} time sheet(s) pending
        </div>
        <div class="secondline" v-if="hasLocked(item)">
          {{ Object.keys(item.timeSheets).length }} locked time sheet(s)
        </div>
        <div class="thirdline" v-if="hasSubmitted(item)">
          {{ Object.keys(item.submitted).length }} submitted time sheet(s)
          awaiting manager approval
        </div>
      </div>
      <div class="rowactionsbox">
        <a v-if="hasLink(item, 'json')" download v-bind:href="item['json']">
          .json<download-icon></download-icon>
        </a>
        <router-link
          v-if="hasLink(item, 'json')"
          v-bind:to="{ name: 'Time Tracking' }"
          v-on:click.native="generateInvoicingCSV(item['json'])"
        >
          invoicing<download-icon></download-icon>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import mixins from "./mixins";
import { format } from "date-fns";
import { isTimeSheet, TimeSheet, Amendment } from "./types";
import { LockIcon, DownloadIcon } from "vue-feather-icons";
import firebase from "../firebase";
import { parse } from "json2csv";
import _ from "lodash";
const db = firebase.firestore();

export default mixins.extend({
  props: ["collection"], // a string, the Firestore Collection name
  components: {
    LockIcon,
    DownloadIcon,
  },
  computed: {
    processedItems(): firebase.firestore.DocumentData[] {
      // Show only items with pending or locked TimeSheets
      return this.items.filter(
        (x) => this.hasPending(x) || this.hasLocked(x) || this.hasSubmitted(x)
      );
    },
  },
  filters: {
    exportDate(date: Date) {
      return format(date, "yyyy MMM dd");
    },
  },
  data() {
    return {
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      items: [],
    };
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.$bind(
      "items",
      this.collectionObject.orderBy("weekEnding", "desc")
    ).catch((error) => {
      alert(`Can't load TimeTracking: ${error.message}`);
    });
  },
  methods: {
    hasLink(item: firebase.firestore.DocumentData, property: string) {
      return (
        Object.prototype.hasOwnProperty.call(item, property) &&
        item[property].length > 32
      );
    },
    hasSubmitted(item: firebase.firestore.DocumentData) {
      return (
        Object.prototype.hasOwnProperty.call(item, "submitted") &&
        Object.keys(item.submitted).length > 0
      );
    },
    hasPending(item: firebase.firestore.DocumentData) {
      return (
        Object.prototype.hasOwnProperty.call(item, "pending") &&
        Object.keys(item.pending).length > 0
      );
    },
    hasLocked(item: firebase.firestore.DocumentData) {
      return (
        Object.prototype.hasOwnProperty.call(item, "timeSheets") &&
        Object.keys(item.timeSheets).length > 0
      );
    },
    async generateInvoicingCSV(url: string) {
      const response = await fetch(url);
      const inputObject = (await response.json()) as (TimeSheet | Amendment)[];
      const { timesheets: items, amendments } = this.foldAmendments(
        inputObject
      );

      // since all entries have the same week ending, pull from the first entry
      let weekEnding;
      if (items.length > 0) {
        weekEnding = new Date(items[0].weekEnding);
      } else {
        weekEnding = new Date(amendments[0].committedWeekEnding);
      }
      const fields = [
        "client",
        "job",
        "code",
        "date",
        "month",
        "year",
        "qty",
        "unit",
        "nc",
        "meals",
        "ref",
        "project",
        "description",
        "comments",
        "employee",
        "surname",
        "givenName",
        "amended",
      ];
      const opts = { fields };

      const timesheetRecords = [];
      for (const item of items) {
        if (!isTimeSheet(item)) {
          throw new Error("There was an error validating the timesheet");
        }
        for (const entry of item.entries) {
          if (entry.timetype !== "R") continue;
          // TODO: verify that time zone conversion isn't needed here
          const date = new Date(entry.date);
          const line = {
            client: "TBTE",
            job: "", // the job number
            code: entry.division,
            date: date.getDate(),
            month: date.getMonth() + 1,
            year: date.getFullYear(),
            qty: entry.jobHours || 0,
            unit: "hours",
            nc: entry.hours || 0,
            meals: entry.mealsHours || 0,
            ref: entry.workrecord || "",
            project: "",
            description: entry.workDescription, // consolidate comments and description
            comments: "",
            employee: item.displayName,
            surname: item.surname,
            givenName: item.givenName,
            amended: entry.amendment,
          };
          if (entry.job !== undefined) {
            // There is a job number, populate client, job, description
            line.client = item.jobsTally[entry.job].client;
            line.job = entry.job;
            line.project = item.jobsTally[entry.job].description;
          }
          timesheetRecords.push(line);
        }
      }

      const amendmentRecords = [];
      for (const entry of amendments) {
        if (entry.timetype !== "R") continue;
        // TODO: verify that time zone conversion isn't needed here
        const date = new Date(entry.date);
        const line = {
          client: "TBTE",
          job: "", // the job number
          code: entry.division,
          date: date.getDate(),
          month: date.getMonth() + 1,
          year: date.getFullYear(),
          qty: entry.jobHours || 0,
          unit: "hours",
          nc: entry.hours || 0,
          meals: entry.mealsHours || 0,
          ref: entry.workrecord || "",
          project: "",
          description: entry.workDescription, // consolidate comments and description
          comments: "",
          employee: entry.displayName,
          surname: entry.surname,
          givenName: entry.givenName,
          amended: true,
        };
        if (entry.job !== undefined) {
          // There is a job number, populate client, job, description
          line.client = entry.client || "";
          line.job = entry.job;
          line.project = entry.jobDescription || "";
        }
        amendmentRecords.push(line);
      }

      const csv = parse(timesheetRecords.concat(amendmentRecords), opts);
      const blob = new Blob([csv], { type: "text/csv" });
      this.downloadBlob(
        blob,
        `invoicing_${this.exportDateWeekStart(weekEnding)}-${this.exportDate(
          weekEnding
        )}.csv`
      );
    },
    // If an amendment has a corresponding timesheet, fold it into that
    // timesheet and update the tallies for that timesheet. Otherwise
    // just return the amendment by itself. Returns an object with a
    // timesheets property whose value is an array of timesheets and
    // an amendments property whose value is amendments that didn't have a
    // corresponding timesheet.
    foldAmendments(items: (TimeSheet | Amendment)[]) {
      const [amendments, timesheets] = _.partition(items, { amendment: true });
      const groupedAmendments = _.groupBy(amendments, "uid") as {
        [x: string]: Amendment[];
      };
      const unfoldedAmendmentsOutput = [] as Amendment[];
      for (const uid in groupedAmendments) {
        const destination = timesheets.find((a) => a.uid === uid) as TimeSheet;
        if (destination !== undefined) {
          // record each amendment's week in the timesheet
          destination.hasAmendmentsForWeeksEnding = [];

          // There is a destination timesheet to fold amendments into.
          // Load the existing tallies
          const workHoursTally = destination["workHoursTally"];
          const nonWorkHoursTally = destination["nonWorkHoursTally"];
          let mealsHoursTally = destination["mealsHoursTally"];
          const divisionsTally = destination["divisionsTally"];
          const jobsTally = destination["jobsTally"];

          // fold all of the amendments in groupedAmendments[uid] into
          // destination and update tallies
          // tally the amendments
          for (const item of groupedAmendments[uid]) {
            // record the week ending of this amendment
            destination.hasAmendmentsForWeeksEnding.push(item.weekEnding);
            if (
              item.timetype === "R" &&
              item.division &&
              item.divisionName &&
              (item.hours || item.jobHours)
            ) {
              // Tally the regular work hours
              if (item.hours) {
                workHoursTally["hours"] += item.hours;
              }
              if (item.jobHours) {
                workHoursTally["jobHours"] += item.jobHours;
              }
              if (item.mealsHours) {
                mealsHoursTally += item.mealsHours;
              }

              // Tally the divisions (must be present for work hours)
              divisionsTally[item.division] = item.divisionName;

              // Tally the jobs (may not be present)
              if (item.job && item.jobDescription && item.client) {
                if (item.job in jobsTally) {
                  // a previous entry already tracked this job, add to totals
                  const hours = item.hours
                    ? jobsTally[item.job].hours + item.hours
                    : jobsTally[item.job].hours;
                  const jobHours = item.jobHours
                    ? jobsTally[item.job].jobHours + item.jobHours
                    : jobsTally[item.job].jobHours;
                  jobsTally[item.job] = {
                    description: item.jobDescription,
                    client: item.client,
                    hours,
                    jobHours,
                  };
                } else {
                  // first instance of this job in the timesheet, set totals to zero
                  jobsTally[item.job] = {
                    description: item.jobDescription,
                    client: item.client,
                    hours: item.hours || 0,
                    jobHours: item.jobHours || 0,
                  };
                }
              } else if (item.hours) {
                // keep track of the number of hours not associated with a job
                // (as opposed to job hours not billable to the client)
                workHoursTally["noJobNumber"] += item.hours;
              } else {
                throw new Error(
                  "The TimeEntry is of type Regular hours but no job or hours are present"
                );
              }
            } else {
              if (!item.hours) {
                throw new Error(
                  "The Amendment is of type nonWorkHours but no hours are present"
                );
              }
              // Tally the non-work hours
              if (item.timetype in nonWorkHoursTally) {
                nonWorkHoursTally[item.timetype] += item.hours;
              } else {
                nonWorkHoursTally[item.timetype] = item.hours;
              }
            }

            // mark this entry as an amendment
            item.amendment = true;

            // add the amendment to timesheet entries
            destination["entries"].push(item);
          }

          // merge the tallies. Because objects are edit-in-place, we only
          // need to reassign the mealsHours which is a primitive value
          destination["mealsHoursTally"] = mealsHoursTally;
        } else {
          // all of the amendments in groupedAmendments[uid] do not match
          // a timesheet and must be exported separately
          unfoldedAmendmentsOutput.push(...groupedAmendments[uid]);
        }
      }
      return {
        timesheets,
        amendments: unfoldedAmendmentsOutput,
      };
    },
  },
});
</script>
