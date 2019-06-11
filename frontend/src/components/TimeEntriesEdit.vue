<template>
  <form id="editor">
    <datepicker class="formblock" :inline="true" v-model="item.date" />
    <div class="formblock">
      <span class="field">
        <input type="radio" name="hasjob" id="nojob" :value="false" />
        <label for="nojob">&nbsp;No Job</label>

        &nbsp;/

        <input type="radio" name="hasjob" id="yesjob" :value="true" />
        <label for="nojob">&nbsp;Job</label>
      </span>

      <span class="field">
        <label for="job">Job</label>
        <input type="text" name="job" v-model="item.job" />
      </span>

      <span class="field">
        <label for="division">Division</label>
        <input type="text" name="division" v-model="item.division" />
      </span>

      <span class="field">
        <label for="timetype">Time Type</label>
        <input type="text" name="timetype" v-model="item.timetype" />
      </span>

      <span class="field">
        <label for="hours">Hours</label>
        <input type="text" name="hours" v-model="item.hours" />
      </span>

      <span class="field">
        <label for="workrecord">Work Record</label>
        <input type="text" name="workrecord" v-model="item.workrecord" />
      </span>

      <span class="field">
        <label for="description">Description</label>
        <input type="text" name="description" v-model="item.description" />
      </span>

      <span class="field">
        <label for="comments">Comments</label>
        <input type="text" name="comments" v-model="item.comments" />
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

export default {
  components: { Datepicker },
  props: ["id"],
  data() {
    return {
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
        // TODO: The editor doesn't work right now because the firebase timestamp
        // format isn't supported by Datepicker. Instead of binding we should
        // likely just get a snapshot to populate item. This could be done
        // once rather than inside a watcher, possibly with updated()
        this.item = id
          ? this.$bind("item", this.$parent.collection.doc(id))
          : {};
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
      this.item.uid = this.user.uid; // include uid of the creating user
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
  width: 320px;
  margin-right: 20px;
  display: flex;
  flex-direction: column;
}
.field label {
  display: inline-block;
  background-color: aquamarine;
  width: 100px;
}
</style>
