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
      <label for="project">Job</label>
      <input
        type="text"
        name="project"
        placeholder="Project or Proposal number"
        v-bind:value="item.project"
        v-on:keydown.arrow-down="onArrowDown"
        v-on:keydown.arrow-up="onArrowUp"
        v-on:focus="showSuggestions = true"
        v-on:blur="showSuggestions = false"
        v-on:input="updateProjectCandidates"
      />
    </span>
    <div
      id="suggestions"
      v-if="showSuggestions && projectCandidates.length > 0"
    >
      <ul>
        <li
          v-for="(c, index) in projectCandidates"
          v-bind:class="{ selected: index === selectedIndex }"
          v-bind:key="c.id"
        >
          {{ c.id }} - {{ c.name }}
        </li>
      </ul>
    </div>

    <span class="field">
      <label for="hours">Hours</label>
      <input type="number" name="hours" v-model.number="item.hours" />
    </span>

    <span
      class="field"
      v-if="
        item.project &&
          item.project !== '' &&
          item.division &&
          item.timetype === 'R'
      "
    >
      <label for="jobHours">Job Hours</label>
      <input type="number" name="jobHours" v-model.number="item.jobHours" />
    </span>

    <span
      class="field"
      v-if="
        item.project &&
          item.project !== '' &&
          item.division &&
          item.timetype === 'R'
      "
    >
      <label for="mealsHours">Meals Hours</label>
      <input type="number" name="mealsHours" v-model.number="item.mealsHours" />
    </span>

    <span
      class="field"
      v-if="
        item.project &&
          item.project !== '' &&
          item.division &&
          item.timetype === 'R'
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

    <span class="field">
      <button type="button" v-on:click="save()">Save</button>
      <button type="button" v-on:click="$router.push(parentPath)">
        Cancel
      </button>
    </span>
  </form>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import { mapState } from "vuex";
import Datepicker from "vuejs-datepicker";
import moment from "moment";
import _ from "lodash";

export default {
  components: { Datepicker },
  props: ["id"],
  data() {
    return {
      dps: {
        // date picker state
        disabled: {
          to: moment()
            .subtract(3, "weeks")
            .toDate(),
          from: moment()
            .add(3, "weeks")
            .toDate()
        },
        highlighted: {
          dates: [new Date()]
        }
      },
      parentPath: null,
      collection: null,
      divisions: [],
      timetypes: [],
      projects: [],
      showSuggestions: false,
      selectedIndex: null,
      projectCandidates: [],
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
    id: {
      immediate: true,
      handler(id) {
        if (id) {
          this.$parent.collection
            .doc(id)
            .get()
            .then(snap => {
              this.item = snap.data();
              this.item.date = this.item.date.toDate();
            });
        } else {
          this.item = {
            date: moment().toDate(),
            timetype: "R"
          };
          // TODO: add defaultDivision from the User so it's pre-populated
        }
      }
    }
  },
  created() {
    const currentRoute = this.$route.matched[this.$route.matched.length - 1];
    this.parentPath = currentRoute.parent.path;
    this.collection = this.$parent.collection;
    this.$bind("divisions", db.collection("Divisions"));
    this.$bind("timetypes", db.collection("TimeTypes"));
    this.$bind("projects", db.collection("Projects"));
  },
  methods: {
    onArrowUp() {
      const count = this.projectCandidates.length;
      this.selectedIndex =
        this.selectedIndex === null ? count - 1 : (this.selectedIndex + count - 1) % count;
      this.item.project = this.projectCandidates[this.selectedIndex].id;
    },
    onArrowDown() {
      const count = this.projectCandidates.length;
      this.selectedIndex =
        this.selectedIndex === null ? 0 : (this.selectedIndex + 1) % count;
      this.item.project = this.projectCandidates[this.selectedIndex].id;
    },
    updateProjectCandidates: _.debounce(function(e) {
      const loBound = e.target.value.trim();
      if (loBound.length > 0) {
        const hiBound = e.target.value.trim() + "\uf8ff";
        this.item.project = loBound; // preserve the value in the input field
        this.$bind(
          "projectCandidates",
          db
            .collection("Projects")
            .where(firebase.firestore.FieldPath.documentId(), ">=", loBound)
            .where(firebase.firestore.FieldPath.documentId(), "<=", hiBound)
            .limit(5)
        );
      } else {
        this.projectCandidates = [];
        delete this.item.project;
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
          "project",
          "projectName",
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

        // Populate or Clear the Project Name
        if (this.item.project && this.item.project.length > 5) {
          // Update
          this.item.projectName = this.projects.filter(
            i => i.id === this.item.project
          )[0].name;
        } else {
          // Clear
          delete this.item.projectName;
          delete this.item.jobHours;
          delete this.item.workorder;
        }
      }

      this.item = _.pickBy(this.item, i => i !== ""); // strip blank fields

      this.item.uid = this.user.uid; // include uid of the creating user
      if (!this.item.hasOwnProperty("date")) {
        // make the date today if not provided by user
        this.item.date = new Date();
      }

      console.log(this.item);

      // Write to database
      if (this.id) {
        // Editing an existing item
        this.collection
          .doc(this.id)
          .set(this.item)
          .then(docRef => {
            this.$router.push(this.parentPath);
          });
      } else {
        // Creating a new item
        this.collection
          .doc()
          .set(this.item)
          .then(docRef => {
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
#suggestions li.selected {
  background-color: #ddd;
}
</style>
