<template>
  <form id="editor">
    <span class="field">
      <label for="job">Project/Proposal #</label>
      <span v-if="editing">{{ id }}</span>
      <input v-else type="text" name="job" v-model="item.id" />
    </span>
    <span class="field">
      <label for="manager">Manager</label>
      <input type="text" name="manager" v-model="item.manager" />
    </span>
    <span class="field">
      <label for="client">Client</label>
      <input type="text" name="client" v-model="item.client" />
    </span>
    <span class="field">
      <label for="clientContact">Client Contact</label>
      <input type="text" name="clientContact" v-model="item.clientContact" />
    </span>
    <span class="field" v-if="item.id && !item.id.startsWith('P') || editing && !id.startsWith('P')">
      <!-- Hide if id is proposal (starts with 'P') -->
      <!-- TODO: Restrict to existing proposals -->
      <label for="proposal">Proposal</label>
      <input type="text" name="proposal" v-model="item.proposal" />
    </span>
    <span class="field">
      <label for="description">Description</label>
      <input type="text" name="code" v-model="item.description" />
    </span>
    <span class="field">
      <label for="status">Status</label>
      <input type="text" name="status" v-model="item.status" />
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
import _ from "lodash";

export default {
  props: ["id"],
  data() {
    return {
      parentPath: null,
      collection: null,
      item: {}
    };
  },
  computed: {
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
      if (this.id) {
        // Editing an existing item
        // Since the UI binds existing id to the key field, no need to delete
        this.collection
          .doc(this.id)
          .set(this.item)
          .then(() => {
            this.$router.push(this.parentPath);
          }).catch(error => {
            alert(`Editing failed: ${error.message}`);
          });
      } else {
        // Creating a new item
        const new_id = this.item.id;
        delete this.item.id;

        this.collection
          .doc(new_id)
          .set(this.item)
          .then(() => {
            this.clearEditor();
            // notify user save is done
          }).catch(error => {
            alert(`Creating failed: ${error.message}`);
          });
      }
    },
    clearEditor() {
      this.item = {};
    }
  }
};
</script>
