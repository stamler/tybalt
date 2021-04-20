<template>
  <form id="editor">
    <span class="field" v-if="collection === 'TimeAmendments'">
      <select name="uid" v-model="item.uid">
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
      <select name="timetype" v-model="item.timetype">
        <option v-for="t in timetypes" :value="t.id" v-bind:key="t.id">
          {{ t.name }}
        </option>
      </select>
    </span>
    <span v-if="trainingTokensInDescriptionWhileRegularHours" class="attention">
      ^Should you choose training instead?
    </span>

    <span class="field" v-if="['R', 'RT'].includes(item.timetype)">
      <select name="division" v-model="item.division">
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
      <label for="job">Job</label>
      <!-- TODO: Show job description/client in uneditable part of field -->
      <input
        type="text"
        name="job"
        placeholder="Project or Proposal number"
        v-bind:value="item.job"
        v-on:keydown.arrow-down="onArrowDown"
        v-on:keydown.arrow-up="onArrowUp"
        v-on:keyup.enter="setJob(jobCandidates[selectedIndex].id)"
        v-on:input="updateJobCandidates"
      />
    </span>
    <div id="suggestions" v-if="showSuggestions && jobCandidates.length > 0">
      <ul>
        <li
          v-for="(c, index) in jobCandidates"
          v-bind:class="{ selected: index === selectedIndex }"
          v-bind:key="c.id"
          v-on:click="setJob(c.id)"
        >
          {{ c.id }} - {{ c.client }}: {{ c.description }}
        </li>
      </ul>
    </div>

    <span
      class="field"
      v-if="
        item.job &&
        item.job !== '' &&
        item.division &&
        ['R', 'RT'].includes(item.timetype)
      "
    >
      <label for="jobHours">Chargeable Hours</label>
      <input type="number" name="jobHours" v-model.number="item.jobHours" />
    </span>

    <span
      class="field"
      v-if="item.timetype !== 'OR' && item.timetype !== 'OTO'"
    >
      <label for="hours">
        {{
          item.job &&
          item.job !== "" &&
          item.division &&
          ["R", "RT"].includes(item.timetype)
            ? "Non-Chargeable "
            : ""
        }}Hours
      </label>
      <input type="number" name="hours" v-model.number="item.hours" />
    </span>

    <span
      class="field"
      v-if="
        item.job &&
        item.job !== '' &&
        item.division &&
        ['R', 'RT'].includes(item.timetype)
      "
    >
      <label for="mealsHours">Meals Hours</label>
      <input type="number" name="mealsHours" v-model.number="item.mealsHours" />
    </span>

    <span
      class="field"
      v-if="
        item.job &&
        item.job !== '' &&
        item.division &&
        ['R', 'RT'].includes(item.timetype)
      "
    >
      <label for="workrecord">Work Record</label>
      <input
        type="text"
        name="workrecord"
        placeholder="Work Record"
        v-model.trim="item.workrecord"
      />
    </span>

    <span
      class="field"
      v-if="
        item.timetype !== 'OR' &&
        item.timetype !== 'OTO' &&
        item.timetype !== 'RB'
      "
    >
      <input
        type="text"
        name="workDescription"
        placeholder="Work Description (5 char minimum)"
        v-model.trim="item.workDescription"
      />
    </span>
    <span class="field" v-if="item.timetype === 'OTO'">
      $<input
        type="number"
        name="payoutRequestAmount"
        placeholder="Amount"
        v-model.number="item.payoutRequestAmount"
      />
    </span>

    <!-- This field is for testing only since weekEnding should be 
    automatically assigned with a trigger cloud function -->
    <!--
    <span class="field">
      <datepicker
        name="datepicker"
        input-class="calendar-input"
        wrapper-class="calendar-wrapper"
        placeholder="WEEK ENDING FOR TESTING"
        :inline="false"
        :disabledDates="dps.disabled"
        :highlighted="dps.highlighted"
        v-model="item.weekEnding"
      />
    </span>
      -->

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

export default Vue.extend({
  components: { Datepicker },
  props: ["id", "collection"],
  data() {
    return {
      dps: {
        // date picker state
        disabled: {
          to: subWeeks(new Date(), 4),
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
      showSuggestions: false,
      selectedIndex: null as number | null,
      jobCandidates: [] as firebase.firestore.DocumentData[],
      item: {} as firebase.firestore.DocumentData,
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
      if (
        newVal === "R" &&
        oldVal !== "R" &&
        this.item.division === undefined
      ) {
        this.item.division = "";
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
  },
  methods: {
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
    setJob(id: string) {
      this.item.job = id;
      this.showSuggestions = false;
      const job = this.jobCandidates.filter((i) => i.id === id)[0];
      this.item.jobDescription = job.description;
      this.item.client = job.client;
    },
    onArrowUp() {
      const count = this.jobCandidates.length;
      this.selectedIndex =
        this.selectedIndex === null
          ? count - 1
          : (this.selectedIndex + count - 1) % count;
      this.item.job = this.jobCandidates[this.selectedIndex].id;
    },
    onArrowDown() {
      const count = this.jobCandidates.length;
      this.selectedIndex =
        this.selectedIndex === null ? 0 : (this.selectedIndex + 1) % count;
      this.item.job = this.jobCandidates[this.selectedIndex].id;
    },
    // any annotation in next line due to the following:
    // https://forum.vuejs.org/t/how-to-get-typescript-method-callback-working/36825
    updateJobCandidates: _.debounce(function (this: any, e: Event) {
      // TODO: possibly use full text search like
      // https://www.npmjs.com/package/adv-firestore-functions
      this.showSuggestions = true;
      const loBound = (e.target as HTMLInputElement).value.trim();
      if (loBound.length > 0) {
        const hiBound = (e.target as HTMLInputElement).value.trim() + "\uf8ff";
        this.item.job = loBound; // preserve the value in the input field
        this.$bind(
          "jobCandidates",
          db
            .collection("Jobs")
            .where(firebase.firestore.FieldPath.documentId(), ">=", loBound)
            .where(firebase.firestore.FieldPath.documentId(), "<=", hiBound)
            .limit(5)
        );
      } else {
        this.jobCandidates = [];
        delete this.item.job;
      }
    }, 650),
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

        delete this.item.payoutRequestAmount;

        // Clear the Job if it's empty or too short
        // The back end will actually validate that it exists
        if (!this.item.job || this.item.job.length < 6) {
          // Clear
          delete this.item.client;
          delete this.item.jobDescription;
          delete this.item.jobHours;
          delete this.item.mealsHours;
          delete this.item.workorder;
        }
      }

      // if timetype is OR or OTO, delete hours and workDescription
      // (other properties already deleted in previous if/else statement)
      if (this.item.timetype === "OR" || this.item.timetype === "OTO") {
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
            //console.log(this.item);
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
            //console.log(this.item);
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
