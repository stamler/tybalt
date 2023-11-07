<template>
  <form id="editor">
    <span class="field">
      <label for="code">Code</label>
      <span v-if="editing">{{ id }}</span>
      <input class="grow" v-else type="text" name="code" v-model="item.id" />
    </span>
    <span class="field">
      <label for="name">Name</label>
      <input class="grow" type="text" name="name" v-model="item.name" />
    </span>
    <span class="field">
      <label for="description">Description</label>
      <input class="grow" type="text" name="code" v-model="item.description" />
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
import { defineComponent } from "vue";
import _ from "lodash";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  DocumentData,
  DocumentSnapshot,
  collection,
  CollectionReference,
  getDoc,
  setDoc,
  doc,
} from "firebase/firestore";
const db = getFirestore(firebaseApp);

export default defineComponent({
  props: ["id", "collectionName"],
  data() {
    return {
      parentPath: "",
      collectionObject: null as CollectionReference | null,
      item: {} as DocumentData,
    };
  },
  computed: {
    editing: function () {
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
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
    this.collectionObject = collection(db, this.collectionName);
    this.setItem(this.id);
  },
  methods: {
    setItem(id: string) {
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }
      if (id) {
        getDoc(doc(this.collectionObject, id)).then(
          (snap: DocumentSnapshot) => {
            if (snap.exists()) {
              this.item = snap.data();
            } else {
              // A document with this id doesn't exist in the database,
              // list instead.  TODO: show a message to the user
              this.$router.push(this.parentPath);
            }
          }
        );
      } else {
        this.item = {};
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
        setDoc(doc(this.collectionObject, this.id), this.item)
          .then(() => {
            this.$router.push(this.parentPath);
          })
          .catch((error: unknown) => {
            if (error instanceof Error) {
              alert(`Save failed: ${error.message}`);
            } else alert(`Save failed: ${JSON.stringify(error)}`);
          });
      } else {
        // Creating a new item
        const newId = this.item.id;
        delete this.item.id;

        setDoc(doc(this.collectionObject, newId), this.item)
          .then(() => {
            this.clearEditor();
            // notify user save is done
          })
          .catch((error: unknown) => {
            if (error instanceof Error) {
              alert(`Save failed: ${error.message}`);
            } else alert(`Save failed: ${JSON.stringify(error)}`);
          });
      }
    },
    clearEditor() {
      this.item = {};
    },
  },
});
</script>
