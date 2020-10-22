<template>
  <form id="editor">
    <span class="field">
      <label for="id">id</label>
      <span>{{ id }}</span>
    </span>
    <span class="field">
      <label for="displayName">Name</label>
      <input type="text" name="displayName" v-model="item.displayName" />
    </span>
    <span class="field">
      <label for="email">Email</label>
      <input type="text" name="email" v-model="item.email" />
    </span>
    <span class="field">
      <label for="manager">Manager</label>
      <select name="manager" v-model="item.manager_uid">
        <option v-for="m in profiles" :value="m.id" v-bind:key="m.id">
          {{ m.displayName }}
        </option>
      </select>
    </span>
    <span class="field">
      <label>Claims</label>
      <span
        class="label"
        v-for="(value, claim) in item.customClaims"
        v-bind:key="claim"
      >
        {{ claim }}
        <span v-on:click="$delete(item.customClaims, claim)">
          <x-circle-icon></x-circle-icon>
        </span>
      </span>
      <span><input type="new_claim"/></span>
      <plus-circle-icon></plus-circle-icon>
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
import _ from "lodash";
import { PlusCircleIcon, XCircleIcon } from "vue-feather-icons";

export default {
  components: {
    PlusCircleIcon,
    XCircleIcon
  },
  props: ["id"],
  data() {
    return {
      parentPath: null,
      collection: null,
      item: {},
      profiles: []
    };
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
    this.$bind("profiles", db.collection("Profiles"));
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
          });
      } else {
        alert("New profiles can only be created by the authentication system");
      }
    }
  }
};
</script>
