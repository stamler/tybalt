<template>
  <form id="editor">
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
      :highlight="dps.highlighted.dates"
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

      <span class="field" v-show="job === undefined">
        <span class="grow">
          <div id="jobAutocomplete" />
        </span>
      </span>
      <span class="field" v-show="job !== undefined">
        <span class="grow">
          <action-button type="delete" @click.prevent="clearJob" />
          {{ job }} / {{ item.client }}:{{ item.jobDescription }}
        </span>
      </span>

      <span class="field" v-if="job && job !== '' && item.division">
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

      <span class="field" v-if="jobCategories !== null">
        <label for="category">Category</label>
        <select class="grow" name="category" v-model="item.category">
          <option disabled selected value="">-- choose category --</option>
          <option v-for="c in jobCategories" :value="c" v-bind:key="c">
            {{ c }}
          </option>
        </select>
      </span>
    </span>

    <!--------------------------------------------------->
    <!-- END FIELDS VISIBLE ONLY FOR R or RT TimeTypes -->
    <!--------------------------------------------------->

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
import { defineComponent } from "vue";
import firebase, { firebaseApp } from "../firebase";
import { useCollection } from "vuefire";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  CollectionReference,
  DocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
const db = getFirestore(firebaseApp);
import { useStateStore } from "../stores/state";
import Datepicker from "@vuepic/vue-datepicker";
import { addWeeks, subWeeks } from "date-fns";
import { shortDateWithWeekday } from "./helpers";
import _ from "lodash";
import algoliasearch from "algoliasearch/lite";
import { autocomplete, getAlgoliaResults } from "@algolia/autocomplete-js";
import ActionButton from "./ActionButton.vue";

export default defineComponent({
  setup() {
    // user doesn't need to be reactive so no refs wanted, just the user object,
    // so we don't use storeToRefs() to toRef()
    return { user: useStateStore().user };
  },
  components: { ActionButton, Datepicker },
  props: ["id", "collectionName"],
  data() {
    return {
      dps: {
        // date picker state
        disabled: {
          to: subWeeks(new Date(), 12),
          from: addWeeks(new Date(), 4),
        },
        highlighted: {
          dates: [new Date()],
        },
      },
      jobCategories: null as string[] | null,
      parentPath: "",
      collectionObject: null as CollectionReference | null,
      divisions: useCollection(collection(db, "Divisions")),
      timetypes: useCollection(collection(db, "TimeTypes")),
      profiles: useCollection(collection(db, "Profiles")),
      item: {} as DocumentData,
      job: undefined as string | undefined,
    };
  },
  computed: {
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
        // The time type has just been changed to R or RT, verify division set
        if (this.item.division === undefined) {
          this.item.division = "";
        }
      }
      if (!["R", "RT"].includes(newVal) && ["R", "RT"].includes(oldVal)) {
        // The time type has just been changed from R or RT, set division
        // and job to undefined
        this.item.division = undefined;
        this.item.job = undefined;
        this.job = undefined;
      }
    },
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
    this.collectionObject = collection(db, this.collectionName);
    this.setItem(this.id);
    this.setupInit();
  },
  methods: {
    clearJob() {
      this.job = undefined;
      this.jobCategories = null;
      delete this.item.category;
    },
    async loadJobCategories(jobId: string | undefined) {
      if (jobId === undefined) {
        this.jobCategories = null;
        return;
      }
      // get the job document from firestore and if the job has a categories
      // list set the jobCategories list
      const jobDoc = await getDoc(doc(db, "Jobs", jobId));
      if (jobDoc.exists()) {
        const categories = jobDoc.get("categories");
        // if categories is an array set the flag to true
        if (Array.isArray(categories)) {
          this.jobCategories = categories;
        } else {
          this.jobCategories = null;
        }
      }
    },
    shortDateWithWeekday,
    async setupInit() {
      const profileSecrets = await getDoc(
        doc(db, "ProfileSecrets", this.user.uid)
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const writeJobToItem = async (values: any) => {
        this.job = values.objectID;
        this.item.jobDescription = values.description;
        this.item.client = values.client;

        await this.loadJobCategories(values.objectID);
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
        getDoc(doc(this.collectionObject, id))
          .then((snap: DocumentSnapshot) => {
            const result = snap.data();
            if (result === undefined) {
              // A document with this id doesn't exist in the database,
              // list instead.
              this.$router.push(this.parentPath);
            } else {
              this.item = result;
              this.job = this.item.job;
              this.item.date = result.date.toDate();
              this.loadJobCategories(this.item.job);
            }
          })
          .catch(() => {
            this.$router.push(this.parentPath);
          });
      } else {
        const profile = await getDoc(doc(db, "Profiles", this.user.uid));
        const defaultDivision = profile.get("defaultDivision");
        this.item = {
          date: new Date(),
          timetype: "R",
          division: defaultDivision ?? "",
        };
        if (this.collectionName === "TimeAmendments") {
          // setting the uid blank surfaces the choose option in the UI
          this.item.uid = "";
        }
      }
    },
    save() {
      // Populate the Time Type Name
      this.item.timetypeName = this.timetypes.filter(
        (i: DocumentData) => i.id === this.item.timetype
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
            (i: DocumentData) => i.id === this.item.division
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

      if (this.collectionName === "TimeEntries") {
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
      if (this.collectionName === "TimeAmendments") {
        try {
          // Populate the displayName, surname & givenName
          const profile = this.profiles.filter(
            (i: DocumentData) => i.id === this.item.uid
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
        setDoc(doc(this.collectionObject, this.id), this.item)
          .then(() => {
            this.$router.push(this.parentPath);
          })
          .catch((error: unknown) => {
            if (error instanceof Error) {
              alert(`Failed to edit Time Entry: ${error.message}`);
            } else alert(`Failed to edit Time Entry: ${JSON.stringify(error)}`);
          });
      } else {
        // Creating a new item
        setDoc(doc(this.collectionObject), this.item)
          .then(() => {
            this.$router.push(this.parentPath);
          })
          .catch((error: unknown) => {
            if (error instanceof Error) {
              alert(`Failed to create Time Entry: ${error.message}`);
            } else
              alert(`Failed to create Time Entry: ${JSON.stringify(error)}`);
          });
      }
    },
  },
});
</script>
<style lang="scss">
@import "./algolia-autocomplete-classic-fork.scss";
</style>
