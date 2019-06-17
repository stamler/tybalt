<template>
  <form id="editor">
    <div class="formblock">
      <span class="field">
        <label for="datepicker">Date</label>
        <datepicker
          name="datepicker"
          wrapper-class="fieldinput"
          :inline="false"
          :disabledDates="dps.disabled"
          :highlighted="dps.highlighted"
          v-model="item.date"
        />
      </span>
      <span class="field">
        <label for="timetype">Time Type</label>
        <select name="timetype" v-model="item.timetype">
          <option v-for="t in timetypes" :value="t.id" v-bind:key="t.id">
            {{ t.name }}
          </option>
        </select>
      </span>

      <span class="field" v-if="item.timetype === 'R'">
        <label for="division">Division</label>
        <select name="division" v-model="item.division">
          <option v-for="d in divisions" :value="d.id" v-bind:key="d.id">
            {{ d.name }}
          </option>
        </select>
      </span>

      <span class="field" v-if="item.timetype === 'R'">
        <label for="project">Project/Proposal</label>
        <input type="text" name="project" v-model.trim="item.project" />
      </span>

      <span class="field">
        <label for="hours">Hours</label>
        <input type="text" name="hours" v-model.number="item.hours" />
      </span>

      <span class="field" v-if="item.project && item.project !== ''">
        <label for="jobHours">Job Hours</label>
        <input type="text" name="jobHours" v-model.number="item.jobHours" />
      </span>

      <span class="field" v-if="item.project && item.project !== ''">
        <label for="mealsHours">Meals Hours</label>
        <input type="text" name="mealsHours" v-model.number="item.mealsHours" />
      </span>

      <span class="field" v-if="item.project && item.project !== ''">
        <label for="workrecord">Work Record</label>
        <input type="text" name="workrecord" v-model.trim="item.workrecord" />
      </span>

      <span class="field">
        <label for="notes">Notes</label>
        <input type="text" name="notes" v-model.trim="item.notes" />
      </span>

      <span class="field">
        <button type="button" v-on:click="save()">Save</button>
        <button type="button" v-on:click="$router.push(parentPath)">
          Cancel
        </button>
      </span>
    </div>
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
          this.item = {};
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
        if (this.item.project && this.item.project.length > 0) {
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
#editor {
  display: flex;
  flex-wrap: wrap;
}
.formblock {
  width: 300px;
  margin-right: 20px;
  display: flex;
  flex-direction: column;
}
.field {
  display: flex;
}
.field select {
  margin-left: auto;
}
.field label {
  margin: 0px;
  padding: 0px;
  display: inline-block;
  background-color: aquamarine;
}
.field input {
  flex-grow: 1;
}

.fieldinput {
  margin-left: auto;
}
</style>
