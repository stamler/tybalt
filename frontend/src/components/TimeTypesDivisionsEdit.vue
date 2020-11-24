<template>
  <form id="editor">
    <span class="field">
      <label for="code">Code</label>
      <span v-if="editing">{{ id }}</span>
      <input v-else type="text" name="code" v-model="item.id" />
    </span>
    <span class="field">
      <label for="name">Name</label>
      <input type="text" name="name" v-model="item.name" />
    </span>
    <span class="field">
      <label for="description">Description</label>
      <input type="text" name="code" v-model="item.description" />
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
import Vue from "vue";
import _ from "lodash";
import firebase from "../firebase";
const db = firebase.firestore();

export default Vue.extend({
  props: ["id", "collection"],
  data() {
    return {
      parentPath: null,
      collectionObject: null,
      item: {}
    };
  },
  computed: {
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
    const currentRoute = this.$route.matched[this.$route.matched.length - 1];
    this.parentPath = currentRoute.parent.path;
    this.collectionObject = db.collection(this.collection);
    this.$bind("items", this.collectionObject).then(this.setItem(this.id));
  },
  methods: {
    setItem(id) {
      if (this.collectionObject !== null && id) {
        this.collectionObject
          .doc(id)
          .get()
          .then(snap => {
            if (snap.exists) {
              this.item = snap.data();
            } else {
              // The id doesn't exist, list instead
              // TODO: show a message to the user
              this.$router.push(this.parentPath);
            }
          });
      } else {
        this.item = {};
      }
    },
    save() {
      this.item = _.pickBy(this.item, i => i !== ""); // strip blank fields
      if (this.id) {
        // Editing an existing item
        // Since the UI binds existing id to the key field, no need to delete
        this.collectionObject
          .doc(this.id)
          .set(this.item)
          .then(() => {
            this.$router.push(this.parentPath);
          });
      } else {
        // Creating a new item
        const newId = this.item.id;
        delete this.item.id;

        this.collectionObject
          .doc(newId)
          .set(this.item)
          .then(() => {
            this.clearEditor();
            // notify user save is done
          });
      }
    },
    clearEditor() {
      this.item = {};
    }
  }
});
</script>
