<template>
  <form id="editor">
    <datepicker
      class="formblock"
      :inline="true"
      :disabledDates="dps.disabled"
      :highlighted="dps.highlighted"
      v-model="item.date"
    />
    <div class="formblock">
      <span class="field">
        <label for="project">Project / Proposal</label>
        <input type="text" name="project" v-model.trim="item.project" />
      </span>

      <span class="field">
        <label for="division">Division</label>
        <input type="text" name="division" v-model.trim="item.division" />
      </span>

      <span class="field">
        <label for="timetype">Time Type</label>
        <input type="text" name="timetype" v-model.trim="item.timetype" />
      </span>

      <span class="field">
        <label for="hours">Hours</label>
        <input type="text" name="hours" v-model.number="item.hours" />
      </span>

      <span class="field">
        <label for="jobHours">Job Hours</label>
        <input type="text" name="jobHours" v-model.number="item.jobHours" />
      </span>

      <span class="field">
        <label for="mealsHours">Meals Hours</label>
        <input type="text" name="mealsHours" v-model.number="item.mealsHours" />
      </span>

      <span class="field">
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
  },
  methods: {
    save() {
      this.item = _.pickBy(this.item, i => i !== ""); // strip blank fields
      console.log(this.item);
      this.item.uid = this.user.uid; // include uid of the creating user
      if (!this.item.hasOwnProperty("date")) {
        // make the date today if not provided by user
        this.item.date = new Date();
      }
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
}
.formblock {
  width: 300px;
  margin-right: 20px;
  display: flex;
  flex-direction: column;
}
.field label {
  display: inline-block;
  background-color: aquamarine;
  width: 140px;
}
</style>
