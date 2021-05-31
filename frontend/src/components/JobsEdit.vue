<template>
  <form id="editor">
    <span class="field">
      <label for="job">Project/Proposal #</label>
      <span v-if="editing">{{ id }}</span>
      <input class="grow" v-else type="text" name="job" v-model="item.id" />
    </span>
    <span class="field">
      <label for="manager">Manager</label>
      <input class="grow" type="text" name="manager" v-model="item.manager" />
    </span>
    <span class="field">
      <label for="client">Client</label>
      <input class="grow" type="text" name="client" v-model="item.client" />
    </span>
    <span class="field">
      <label for="clientContact">Client Contact</label>
      <input
        class="grow"
        type="text"
        name="clientContact"
        v-model="item.clientContact"
      />
    </span>
    <span
      class="field"
      v-if="
        (item.id && !item.id.startsWith('P')) ||
        (editing && !id.startsWith('P'))
      "
    >
      <!-- Hide if id is proposal (starts with 'P') -->
      <!-- TODO: Restrict to existing proposals -->
      <label for="proposal">Proposal</label>
      <input class="grow" type="text" name="proposal" v-model="item.proposal" />
    </span>
    <span class="field">
      <label class="grow" for="description">Description</label>
      <input type="text" name="code" v-model="item.description" />
    </span>
    <span class="field">
      <select class="grow" name="status" v-model="item.status">
        <option disabled selected value="">-- choose status --</option>
        <option value="Active">Active</option>
        <option value="Cancelled">Cancelled</option>
        <template v-if="editing">
          <option v-if="id.startsWith('P')" value="Not Awarded">
            Not Awarded
          </option>
          <option v-if="id.startsWith('P')" value="Awarded">Awarded</option>
          <option v-if="!id.startsWith('P')" value="Closed">Closed</option>
        </template>
        <template v-if="!editing && item.id">
          <option v-if="item.id.startsWith('P')" value="Not Awarded">
            Not Awarded
          </option>
          <option v-if="item.id.startsWith('P')" value="Awarded">
            Awarded
          </option>
          <option v-if="!item.id.startsWith('P')" value="Closed">Closed</option>
        </template>
      </select>
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
import Vue from "vue";
import _ from "lodash";
import firebase from "../firebase";
const db = firebase.firestore();

export default Vue.extend({
  props: ["id", "collection"],
  data() {
    return {
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      item: {} as firebase.firestore.DocumentData,
    };
  },
  computed: {
    editing: function (): boolean {
      return this.id !== undefined;
    },
  },
  watch: {
    id: function (id) {
      this.setItem(id);
    }, // first arg is newVal, second is oldVal
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.setItem(this.id);
  },
  methods: {
    setItem(id: string) {
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
            }
          });
      } else {
        this.item = {
          status: "",
        };
      }
    },
    save() {
      this.item = _.pickBy(this.item, (i) => i !== ""); // strip blank fields
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }
      if (this.id) {
        // Editing an existing item
        // Since the UI binds existing id to the key field, no need to delete
        this.collectionObject
          .doc(this.id)
          .set(this.item)
          .then(() => {
            this.$router.push(this.parentPath);
          })
          .catch((error) => {
            alert(`Editing failed: ${error.message}`);
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
          })
          .catch((error) => {
            alert(`Creating failed: ${error.message}`);
          });
      }
    },
    clearEditor() {
      this.item = {} as firebase.firestore.DocumentData;
    },
  },
});
</script>
