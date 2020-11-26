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
      <select name="manager" v-model="item.managerUid">
        <option v-for="m in managers" :value="m.id" v-bind:key="m.id">
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
      <span><input type="text" name="newClaim" v-model="newClaim"/></span>
      <span v-on:click="addClaim(newClaim)">
        <plus-circle-icon></plus-circle-icon>
      </span>
    </span>
    <span class="field">
      <label for="defaultDivision">Default Division</label>
      <select name="defaultDivision" v-model="item.defaultDivision">
        <option v-for="d in divisions" :value="d.id" v-bind:key="d.id">
          {{ d.name }}
        </option>
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
  props: ["id", "collection"],
  data() {
    return {
      parentPath: "",
      collectionObject: null,
      item: {},
      newClaim: null,
      managers: [],
      divisions: []
    };
  },
  watch: {
    id: function(id) {
      this.setItem(id);
    } // first arg is newVal, second is oldVal
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.$bind(
      "managers",
      db.collection("Profiles").where("customClaims.tapr", "==", true)
    );
    this.$bind("divisions", db.collection("Divisions"));
    this.setItem(this.id);
  },
  methods: {
    setItem(id) {
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }
      if (id) {
        this.collectionObject
          .doc(id)
          .get()
          .then(snap => {
            if (snap.exists) {
              this.item = snap.data();
            } else {
              // A document with this id doesn't exist in the database,
              // list instead.  TODO: show a message to the user
              this.$router.push(this.parentPath);
            }
          });
      } else {
        this.item = {};
      }
    },
    addClaim(claim) {
      this.$set(this.item.customClaims, claim, true);
      this.newClaim = null;
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
        alert("New profiles can only be created by the authentication system");
      }
    }
  }
};
</script>
