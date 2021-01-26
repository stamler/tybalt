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
        <div class="thirdline"></div>
      </div>
      <div class="rowactionsbox">
        <router-link
          v-if="hasPending(item)"
          v-bind:to="{ name: 'Time Tracking' }"
          v-on:click.native="lockTimesheets(item.weekEnding)"
        >
          <lock-icon></lock-icon>
        </router-link>
        <a v-if="hasLink(item, 'json')" download v-bind:href="item['json']">
          .json<download-icon></download-icon>
        </a>
        <router-link
          v-if="hasLink(item, 'json')"
          v-bind:to="{ name: 'Time Tracking' }"
          v-on:click.native="generatePayrollCSV(item['json'])"
        >
          payroll<download-icon></download-icon>
        </router-link>
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
import Vue from "vue";
import { format, subDays } from "date-fns";
import { LockIcon, DownloadIcon } from "vue-feather-icons";
import firebase from "../firebase";
import store from "../store";
import { parse } from "json2csv";
import _ from "lodash";
const db = firebase.firestore();

interface Amendment {
  // required properties always
  date: string;
  created: string;
  committed: string;
  committedWeekEnding: string;
  weekEnding: string;
  creator: string;
  creatorName: string;
  displayName: string;
  timetype: string;
  timetypeName: string;
  amendment: true;
  uid: string;

  // properties which are never required, but may require eachother
  division?: string;
  divisionName?: string;
  workDescription?: string;
  hours?: number;
  mealsHours?: number;
  client?: string;
  job?: string;
  jobDescription?: string;
  workrecord?: string;
  jobHours?: number;
}

interface TimeSheet {
  // required properties always
  uid: string;
  displayName: string;
  bankedHours: number;
  mealsHoursTally: number;
  divisionsTally: { [x: string]: string };
  jobsTally: {
    [job: string]: {
      description: string;
      client: string;
      hours: number;
      jobHours: number;
      manager?: string;
      proposal?: string;
      status?: string;
      clientContact?: string;
    };
  };
  entries: any[];

  // others to be filled in later
  [x: string]: any;
}

export default Vue.extend({
  props: ["collection"], // a string, the Firestore Collection name
  components: {
    LockIcon,
    DownloadIcon
  },
  computed: {
    processedItems(): firebase.firestore.DocumentData[] {
      // Show only items with pending or locked TimeSheets
      return this.items.filter(x => this.hasPending(x) || this.hasLocked(x));
    }
  },
  filters: {
    exportDate(date: Date) {
      return format(date, "yyyy MMM dd");
    }
  },
  data() {
    return {
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      items: []
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
    exportDate(date: Date) {
      return format(date, "yyyy MMM dd");
    },
    exportDateWeekStart(date: Date) {
      const startDate = subDays(date, 6);
      return format(startDate, "yyyy MMM dd");
    },
    hasLink(item: firebase.firestore.DocumentData, property: string) {
      return (
        Object.prototype.hasOwnProperty.call(item, property) &&
        item[property].length > 32
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
    lockTimesheets(weekEnding: firebase.firestore.Timestamp) {
      const lockTimesheets = firebase
        .functions()
        .httpsCallable("lockTimesheets");
      const week = weekEnding.toDate().getTime();
      // TODO: replace confirm() with modal in Vue
      if (
        confirm("Locking Timesheets is not reversible. Do you want to proceed?")
      ) {
        store.commit("startTask", {
          id: `lock${week}`,
          message: "locking + exporting"
        });
        return lockTimesheets({ weekEnding: week })
          .then(() => {
            store.commit("endTask", { id: `lock${week}` });
          })
          .catch(error => {
            store.commit("endTask", { id: `lock${week}` });
            alert(`Error exporting timesheets: ${error.message}`);
          });
      }
    },
    async generatePayrollCSV(url: string) {
      const response = await fetch(url);
      const items = await response.json();
      // since all entries have the same week ending, pull from the first entry
      const weekEnding = new Date(items[0].weekEnding);
      const fields = [
        "weekEnding",
        {
          label: "name",
          value: "displayName"
        },
        {
          label: "manager",
          value: "managerName"
        },
        {
          label: "meals",
          value: "mealsHoursTally"
        },
        {
          label: "days off rotation",
          value: "offRotationDaysTally"
        },
        {
          label: "hours worked",
          value: "R"
        },
        "OB",
        "OH",
        "OO",
        "OP",
        "OS",
        "OV",
        {
          label: "overtime hours to bank",
          value: "RB"
        }
      ];
      const opts = { fields };
      for (const item of items) {
        delete item.uid;
        delete item.managerUid;
        delete item.jobsTally;
        delete item.divisionsTally;
        delete item.entries;
        item["R"] = item.workHoursTally.jobHours + item.workHoursTally.hours;
        delete item.workHoursTally;
        for (const key in item.nonWorkHoursTally) {
          item[key] = item.nonWorkHoursTally[key];
        }
        delete item.nonWorkHoursTally;
        item["RB"] = item.bankedHours;
        delete item.bankedHours;
      }
      const csv = parse(items, opts);
      const blob = new Blob([csv], { type: "text/csv" });
      this.downloadBlob(
        blob,
        `payroll_${this.exportDateWeekStart(weekEnding)} -
        ${this.exportDate(weekEnding)}.csv`
      );
    },
    async generateInvoicingCSV(url: string) {
      const response = await fetch(url);
      const items = await response.json();
      // since all entries have the same week ending, pull from the first entry
      const weekEnding = new Date(items[0].weekEnding);

      const output = [];

      for (const item of items) {
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
            employee: item.displayName
          };
          if (entry.job !== undefined) {
            // There is a job number, populate client, job, description
            line.client = item.jobsTally[entry.job].client;
            line.job = entry.job;
            line.project = item.jobsTally[entry.job].description;
          }
          output.push(line);
        }
      }
      const csv = parse(output);
      const blob = new Blob([csv], { type: "text/csv" });
      this.downloadBlob(
        blob,
        `invoicing_${this.exportDateWeekStart(weekEnding)} -
        ${this.exportDate(weekEnding)}.csv`
      );
    },
    // Force the download of a blob to a file by creating an
    // anchor and programmatically clicking it.
    downloadBlob(blob: Blob, filename: string) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "download";

      // release object URL after element has been clicked
      // required for one-off downloads of the blob content
      const clickHandler = () => {
        setTimeout(() => {
          URL.revokeObjectURL(url);
          a.removeEventListener("click", clickHandler);
        }, 150);
      };

      // Add the click event listener on the anchor element
      // Comment out this line if you don't want a one-off download of the blob content
      a.addEventListener("click", clickHandler, false);

      // Programmatically trigger a click on the anchor element
      // Useful if you want the download to happen automatically
      // Without attaching the anchor element to the DOM
      // Comment out this line if you don't want an automatic download of the blob content
      a.click();

      // Return the anchor element
      // Useful if you want a reference to the element
      // in order to attach it to the DOM or use it in some other way
      return a;
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
      const timesheetsOutput = [] as TimeSheet[];
      const unfoldedAmendmentsOutput = [] as Amendment[];
      for (const uid in groupedAmendments) {
        const destination = timesheets.find((a) => a.uid === uid) as TimeSheet;
        if (destination !== undefined) {
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
                throw new Error("The TimeEntry is of type Regular hours but no job or hours are present")
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
        timesheets: timesheetsOutput,
        amendments: unfoldedAmendmentsOutput,
      }
    }
  }
});
</script>
