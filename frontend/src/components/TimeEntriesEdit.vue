<template>
  <form id="editor">
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

    <span class="field" v-if="item.timetype === 'R'">
      <select name="division" v-model="item.division">
        <option v-for="d in divisions" :value="d.id" v-bind:key="d.id">
          {{ d.name }}
        </option>
      </select>
    </span>

    <span
      class="field"
      v-if="item.timetype === 'R' && item.division && item.division !== ''"
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
        item.job && item.job !== '' && item.division && item.timetype === 'R'
      "
    >
      <label for="jobHours">Job Hours</label>
      <input type="number" name="jobHours" v-model.number="item.jobHours" />
    </span>

    <span class="field" v-if="item.timetype !== 'OR'">
      <label for="hours">Non-Job Hours</label>
      <input type="number" name="hours" v-model.number="item.hours" />
    </span>

    <span
      class="field"
      v-if="
        item.job && item.job !== '' && item.division && item.timetype === 'R'
      "
    >
      <label for="mealsHours">Meals Hours</label>
      <input type="number" name="mealsHours" v-model.number="item.mealsHours" />
    </span>

    <span
      class="field"
      v-if="
        item.job && item.job !== '' && item.division && item.timetype === 'R'
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

    <span class="field">
      <input
        type="text"
        name="notes"
        placeholder="Notes"
        v-model.trim="item.notes"
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

<script>
import firebase from "../firebase";
const db = firebase.firestore();
import { mapState } from "vuex";
import Datepicker from "vuejs-datepicker";
import { addWeeks, subWeeks } from "date-fns";
import _ from "lodash";

export default {
  components: { Datepicker },
  props: ["id", "collection"],
  data() {
    return {
      dps: {
        // date picker state
        disabled: {
          to: subWeeks(new Date(), 4),
          from: addWeeks(new Date(), 4)
        },
        highlighted: {
          dates: [new Date()]
        }
      },
      parentPath: "",
      collectionObject: null,
      divisions: [],
      timetypes: [],
      showSuggestions: false,
      selectedIndex: null,
      jobCandidates: [],
      item: {}
    };
  },
  computed: {
    ...mapState(["user"]),
    editing: function() {
      return this.id !== undefined;
    }
  },
  watch: {
    id: function(id) {
      this.setItem(id);
    } // first arg is newVal, second is oldVal
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.$bind("divisions", db.collection("Divisions"));
    this.$bind("timetypes", db.collection("TimeTypes"));
    this.setItem(this.id);
  },
  methods: {
    setItem(id) {
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }
      if (id) {
        this.collectionObject
          .doc(id)
          .get()
          .then(snap => {
            this.item = snap.data();
            this.item.date = this.item.date.toDate();
            // Next line is only used for testing, normally hidden in UI
            // The user shouldn't be manually setting the weekEnding because
            // this is done using an onWrite() trigger. We can test this
            // functionality by showing the weekEnding field in the UI
            // component above. The next line makes sure the format is a JS
            // date object so the date picker can display and edit it.
            this.item.weekEnding = this.item.weekEnding.toDate();
          });
      } else {
        this.item = {
          date: new Date(),
          timetype: "R"
        };
        // TODO: add defaultDivision from the User so it's pre-populated
      }
    },
    setJob(id) {
      this.item.job = id;
      this.showSuggestions = false;
      const job = this.jobCandidates.filter(i => i.id === id)[0];
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
    updateJobCandidates: _.debounce(function(e) {
      // TODO: possibly use full text search like
      // https://www.npmjs.com/package/adv-firestore-functions
      this.showSuggestions = true;
      const loBound = e.target.value.trim();
      if (loBound.length > 0) {
        const hiBound = e.target.value.trim() + "\uf8ff";
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
    }, 400),
    save() {
      // Populate the Time Type Name
      this.item.timetypeName = this.timetypes.filter(
        i => i.id === this.item.timetype
      )[0].name;

      // if timetype isn't R, delete disallowed properties
      if (this.item.timetype !== "R") {
        [
          "division",
          "divisionName",
          "job",
          "jobDescription",
          "client",
          "jobHours",
          "mealsHours",
          "workrecord"
        ].forEach(x => delete this.item[x]);
      } else {
        // timetype is R, division must be present
        if (this.item.division && this.item.division.length > 0) {
          // write divisionName
          this.item.divisionName = this.divisions.filter(
            i => i.id === this.item.division
          )[0].name;
        } else {
          throw "Division Missing";
        }

        // Clear the Job if it's empty or too short
        // The back end will actually validate that it exists
        if (!this.item.job || this.item.job.length < 6) {
          // Clear
          delete this.item.client;
          delete this.item.jobDescription;
          delete this.item.jobHours;
          delete this.item.workorder;
        }
      }

      // if timetype is OR, delete hours too (other properties already
      // deleted in previous if/else statement )
      if (this.item.timetype === "OR") {
        delete this.item["hours"];
      }

      this.item = _.pickBy(this.item, i => i !== ""); // strip blank fields

      this.item.uid = this.user.uid; // include uid of the creating user
      if (!Object.prototype.hasOwnProperty.call(this.item, "date")) {
        // make the date today if not provided by user
        this.item.date = new Date();
      }

      // Write to database
      if (this.id) {
        // Editing an existing item
        this.collectionObject
          .doc(this.id)
          .set(this.item)
          .then(() => {
            this.$router.push(this.parentPath);
          });
      } else {
        // Creating a new item
        this.collectionObject
          .doc()
          .set(this.item)
          .then(() => {
            this.$router.push(this.parentPath);
          });
      }
    }
  }
};
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
