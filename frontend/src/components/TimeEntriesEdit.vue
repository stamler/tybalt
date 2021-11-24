<template>
  <form id="editor">
    <span class="field" v-if="collection === 'TimeAmendments'">
      <select class="grow" name="uid" v-model="item.uid">
        <option disabled selected value="">-- choose an employee --</option>
        <option v-for="p in profiles" :value="p.id" v-bind:key="p.id">
          {{ p.displayName }}
        </option>
      </select>
    </span>
    <span class="field">
      <datepicker
        name="datepicker"
        input-class="calendar-input"
        wrapper-class="calendar-wrapper"
        placeholder="Date"
        :inline="false"
        :disabledDates="dps.disabled"
        :highlighted="dps.highlighted"
        v-model="item.date"
      />
    </span>
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

    <span class="field" v-if="['R', 'RT'].includes(item.timetype)">
      <select class="grow" name="division" v-model="item.division">
        <option disabled selected value="">-- choose division --</option>
        <option v-for="d in divisions" :value="d.id" v-bind:key="d.id">
          {{ d.id }} - {{ d.name }}
        </option>
      </select>
    </span>

    <span
      class="field"
      v-if="
        ['R', 'RT'].includes(item.timetype) &&
        item.division &&
        item.division !== ''
      "
    >
    </span>
    <span v-show="['R', 'RT'].includes(item.timetype) && job === undefined">
      <div id="jobAutocomplete" />
    </span>
    <span
      class="field"
      v-show="['R', 'RT'].includes(item.timetype) && job !== undefined"
    >
      <button type="button" v-on:click="job = undefined">
        <x-circle-icon></x-circle-icon>
      </button>
      {{ job }} / {{ item.client }}:{{ item.jobDescription }}
    </span>

    <span
      class="field"
      v-if="
        job &&
        job !== '' &&
        item.division &&
        ['R', 'RT'].includes(item.timetype)
      "
    >
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

    <span
      class="field"
      v-if="!['OR', 'OW', 'OTO'].includes(item.timetype) && job === undefined"
    >
      <label for="hours">
        {{
          job &&
          job !== "" &&
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
        job &&
        job !== '' &&
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
      <button type="button" v-on:click="save()">Save</button>
      <button type="button" v-on:click="$router.push(parentPath)">
        Cancel
      </button>
    </span>
  </form>
</template>

<script lang="ts">
import Vue from "vue";
import firebase from "../firebase";
const db = firebase.firestore();
import { mapState } from "vuex";
import Datepicker from "vuejs-datepicker";
import { addWeeks, subWeeks } from "date-fns";
import _ from "lodash";
import algoliasearch from "algoliasearch/lite";
import { autocomplete, getAlgoliaResults } from "@algolia/autocomplete-js";
import "@algolia/autocomplete-theme-classic";
import { XCircleIcon } from "vue-feather-icons";

export default Vue.extend({
  components: { Datepicker, XCircleIcon },
  props: ["id", "collection"],
  data() {
    return {
      dps: {
        // date picker state
        disabled: {
          to: subWeeks(new Date(), 8),
          from: addWeeks(new Date(), 4),
        },
        highlighted: {
          dates: [new Date()],
        },
      },
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      divisions: [] as firebase.firestore.DocumentData[],
      timetypes: [] as firebase.firestore.DocumentData[],
      profiles: [] as firebase.firestore.DocumentData[],
      item: {} as firebase.firestore.DocumentData,
      job: undefined as string | undefined,
    };
  },
  computed: {
    ...mapState(["user"]),
    trainingTokensInDescriptionWhileRegularHours(): boolean {
      if (
        this.item.timetype !== undefined &&
        this.item.workDescription !== undefined
      ) {
        const lowercase = this.item.workDescription.toLowerCase().trim();
        const lowercaseTokens = lowercase.split(/\s+/);
        return (
          this.item.timetype === "R" &&
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
    },
  },
  watch: {
    id: function (id) {
      this.setItem(id);
    }, // first arg is newVal, second is oldVal
    "item.timetype": function (newVal, oldVal) {
      if (["R", "RT"].includes(newVal) && !["R", "RT"].includes(oldVal)) {
        // The time type has just been changed to R or RT, verify division is
        // set and instantiate the autocomplete function
        if (this.item.division === undefined) {
          this.item.division = "";
        }
      }
    },
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.$bind("divisions", db.collection("Divisions"));
    this.$bind("timetypes", db.collection("TimeTypes"));
    this.$bind("profiles", db.collection("Profiles"));
    this.setItem(this.id);
    this.setup();
  },
  methods: {
    async setup() {
      const profileSecrets = await db
        .collection("ProfileSecrets")
        .doc(this.user.uid)
        .get();
      const writeJobToItem = (values: any) => {
        this.job = values.objectID;
        this.item.jobDescription = values.description;
        this.item.client = values.client;
      };
      const searchClient = algoliasearch(
        "F7IPMZB3IW",
        profileSecrets.get("algoliaSearchKey")
      );
      autocomplete({
        container: "#jobAutocomplete",
        placeholder: "search jobs...",
        getSources() {
          return [
            {
              sourceId: "jobs",
              onSelect({ item }) {
                writeJobToItem(item);
              },
              templates: {
                item({ item }) {
                  return `${item.objectID} - ${item.client}:${item.description}`;
                },
              },
              getItems({ query }) {
                return getAlgoliaResults({
                  searchClient,
                  queries: [
                    {
                      indexName: "tybalt_jobs",
                      query,
                    },
                  ],
                });
              },
            },
          ];
        },
      });
    },
    async setItem(id: string) {
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }
      if (id) {
        this.collectionObject
          .doc(id)
          .get()
          .then((snap: firebase.firestore.DocumentSnapshot) => {
            const result = snap.data();
            if (result === undefined) {
              // A document with this id doesn't exist in the database,
              // list instead.
              this.$router.push(this.parentPath);
            } else {
              this.item = result;
              this.job = this.item.job;
              this.item.date = result.date.toDate();
            }
          })
          .catch(() => {
            this.$router.push(this.parentPath);
          });
      } else {
        const profile = await db
          .collection("Profiles")
          .doc(this.user.uid)
          .get();
        const defaultDivision = profile.get("defaultDivision");
        this.item = {
          date: new Date(),
          timetype: "R",
          division: defaultDivision ?? "",
        };
        if (this.collection === "TimeAmendments") {
          // setting the uid blank surfaces the choose option in the UI
          this.item.uid = "";
        }
      }
    },
    save() {
      // Populate the Time Type Name
      this.item.timetypeName = this.timetypes.filter(
        (i) => i.id === this.item.timetype
      )[0].name;

      // if timetype isn't R or RT, delete disallowed properties
      if (!["R", "RT"].includes(this.item.timetype)) {
        [
          "division",
          "divisionName",
          "job",
          "jobDescription",
          "client",
          "jobHours",
          "mealsHours",
          "workrecord",
        ].forEach((x) => delete this.item[x]);
      } else {
        // timetype is R or RT, division must be present
        if (this.item.division && this.item.division.length > 0) {
          // write divisionName
          this.item.divisionName = this.divisions.filter(
            (i) => i.id === this.item.division
          )[0].name;
        } else {
          throw "Division Missing";
        }

        // TODO: catch the above throw and notify the user.
        // TODO: build more validation here to notify the user of errors
        // before hitting the backend.

        // remove values of zero in hours fields
        if (this.item.mealsHours === 0) {
          delete this.item.mealsHours;
        }

        if (this.item.jobHours === 0) {
          delete this.item.jobHours;
        }

        if (this.item.hours === 0) {
          delete this.item.hours;
        }

        delete this.item.payoutRequestAmount;

        // Clear the Job if it's empty or too short, otherwise clear hours
        // since we don't allow non-chargeable time with a job number
        // The back end will actually validate that it exists
        if (!this.job || this.job.length < 6) {
          // Clear
          delete this.item.job;
          delete this.item.client;
          delete this.item.jobDescription;
          delete this.item.jobHours;
          delete this.item.workorder;
        } else {
          // set the job in the item
          this.item.job = this.job;
          delete this.item.hours;
        }
      }

      // if timetype is OW, OR or OTO, delete hours and workDescription
      // (other properties already deleted in previous if/else statement)
      if (["OR", "OW", "OTO"].includes(this.item.timetype)) {
        delete this.item.hours;
        delete this.item.workDescription;
      }

      // delete payoutRequestAmount if it's not a payout request
      if (this.item.timetype !== "OTO") {
        delete this.item.payoutRequestAmount;
      }

      this.item = _.pickBy(this.item, (i) => i !== ""); // strip blank fields

      if (this.collection === "TimeEntries") {
        // include uid of the creating user
        this.item.uid = this.user.uid;
      }

      if (!Object.prototype.hasOwnProperty.call(this.item, "date")) {
        // make the date today if not provided by user
        this.item.date = new Date();
      }

      // If we're creating an Amendment rather than a TimeEntry, add a creator
      // and creator name, set the displayName from the uid given in the UI,
      // and add a sentinel for the server timestamp
      if (this.collection === "TimeAmendments") {
        try {
          // Populate the displayName, surname & givenName
          const profile = this.profiles.filter(
            (i) => i.id === this.item.uid
          )[0];
          this.item.displayName = profile.displayName;
          this.item.surname = profile.surname;
          this.item.givenName = profile.givenName;
        } catch {
          alert("Specify an employee");
        }

        this.item.creator = this.user.uid;
        this.item.creatorName = this.user.displayName;
        this.item.created = firebase.firestore.FieldValue.serverTimestamp();
        this.item.committed = false;
      }

      // Write to database
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }

      if (this.id) {
        // Editing an existing item
        this.collectionObject
          .doc(this.id)
          .set(this.item)
          .then(() => {
            this.$router.push(this.parentPath);
          })
          .catch((error) => {
            alert(`Failed to edit Time Entry: ${error.message}`);
          });
      } else {
        // Creating a new item
        this.collectionObject
          .doc()
          .set(this.item)
          .then(() => {
            this.$router.push(this.parentPath);
          })
          .catch((error) => {
            alert(`Failed to create Time Entry: ${error.message}`);
          });
      }
    },
  },
});
</script>
<style>
#suggestions {
  padding: 0.25em;
  border-radius: 0em 0em 1em 1em;
  border-bottom: 1px solid #ccc;
  border-left: 1px solid #ccc;
  border-right: 1px solid #ccc;
}
#suggestions ul,
#suggestions li {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  list-style-type: none;
}
#suggestions li.selected,
#suggestions li:hover {
  background-color: #ddd;
}
/* https://www.digitalocean.com/community/tutorials/vuejs-vue-autocomplete-component#async-loading */
</style>
