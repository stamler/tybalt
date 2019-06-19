<template>
  <form id="editor">
    <span class="field" v-for="field in Object.keys(schema)" v-bind:key="field">
      <label for>{{ field }}</label>
      <!-- disable input because we're editing and this field is the id -->
      <span v-if="editing && schema[field].id">{{ item.id }}</span>
      <!-- enable input for this regular field -->
      <input v-else type="text" v-model="item[field]" />
    </span>
    <button type="button" v-on:click="save()">Save</button>
    <button type="button" v-on:click="$router.push(parentPath)">Cancel</button>
  </form>
</template>

<script>
import { mapState } from "vuex";

export default {
  props: ["id", "saveUid"],
  data() {
    return {
      parentPath: null,
      schema: {},
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
        this.item = id
          ? this.$bind("item", this.$parent.collection.doc(id))
          : {};
      }
    }
  },
  created() {
    const currentRoute = this.$route.matched[this.$route.matched.length - 1];
    this.parentPath = currentRoute.parent.path;
    this.schema = this.$parent.schema;
    this.collection = this.$parent.collection;
  },
  methods: {
    save() {
      // TODO: consider this model
      // https://simonkollross.de/posts/vuejs-using-v-model-with-objects-for-custom-components
      // if one of the properties in schema has id = true then use
      // that as an arg to doc(), otherwise leave it blank.
      if (this.saveUid) {
        this.item.uid = this.user.uid;
      }
      if (this.id) {
        // Editing an existing item
        // Since the UI binds existing id to the key field, no need to delete
        this.collection
          .doc(this.id)
          .set(this.item)
          .then(docRef => {
            this.$router.push(this.parentPath);
          });
      } else {
        // Creating a new item
        const id_attribs = Object.keys(this.schema).filter(
          i => this.schema[i].id
        );

        if (id_attribs.length === 0) {
          // no attributes with id property in schema
          this.collection
            .doc()
            .set(this.item)
            .then(docRef => {
              this.clearEditor();
              // notify user save is done
            });
        } else if (id_attribs.length === 1) {
          // one attribute with id property in schema. Remove it
          // from the data and add it to the id
          const new_id = this.item[id_attribs[0]];
          delete this.item[id_attribs[0]];
          this.collection
            .doc(new_id)
            .set(this.item)
            .then(docRef => {
              this.clearEditor();
              // notify user save is done
            });
        } else {
          // ERROR: the schema stipulates more than one attribute is id
          console.log("The schema says multiple attributes are id, not saving");
          // TODO: Notify user of error in UI
        }
      }
    },
    clearEditor() {
      this.item = {};
    }
  }
};
</script>
