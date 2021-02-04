<template>
  <div>
    <div id="spacer"></div>
    <div class="actions">
      <router-link to="#" v-on:click.native="signOut()">Sign Out</router-link>
    </div>
    <div id="dash">
      <h2>Hi, {{ user.displayName }}</h2>
      <img alt="TBTE logo" src="../assets/logo.png" />
      <form id="editor">
        <h3>Settings</h3>
        <h4>Time Sheets</h4>
        <span class="field">
          <label for="manager">Manager</label>
          <select name="manager" v-model="item.managerUid">
            <option v-for="m in managers" :value="m.id" v-bind:key="m.id">
              {{ m.displayName }}
            </option>
          </select>
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
          <button type="button" v-on:click="save()">Save and sign out</button>
        </span>
        <br />
        <p>
          If you save changes here, you will be signed out and changes will take
          effect when you next sign in.
        </p>
      </form>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { signOut } from "../main";
import { mapState } from "vuex";
import firebase from "../firebase";
const db = firebase.firestore();
import _ from "lodash";

export default Vue.extend({
  data() {
    return {
      item: {} as firebase.firestore.DocumentData,
      managers: [] as firebase.firestore.DocumentData[],
      divisions: [] as firebase.firestore.DocumentData[]
    };
  },
  computed: mapState(["user"]),
  created() {
    this.$bind(
      "managers",
      db.collection("Profiles").where("customClaims.tapr", "==", true)
    );
    this.$bind("divisions", db.collection("Divisions"));
    this.setItem(this.user.uid);
  },
  methods: {
    signOut,
    setItem(id: string) {
      if (id) {
        db.collection("Profiles")
          .doc(id)
          .get()
          .then((snap: firebase.firestore.DocumentSnapshot) => {
            const result = snap.data();
            if (result === undefined) {
              // A document with this id doesn't exist in the database,
              // list instead.
              alert(`No profile found for user id ${id}`);
            } else {
              this.item = result;
            }
          })
          .catch(() => {
            alert(`Error loading profile for user id ${id}`);
          });
      } else {
        this.item = {};
      }
    },
    save() {
      // Editing an existing item
      // Since the UI binds existing id to the key field, no need to delete
      db.collection("Profiles")
        .doc(this.user.uid)
        .set(
          {
            defaultDivision: this.item.defaultDivision,
            managerUid: this.item.managerUid,
          },
          { merge: true }
        )
        .then(signOut);
    },
  },
});
</script>
<style>
#dash {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
#dash img,
h2 {
  align-self: center;
}
#spacer {
  background-color: rgb(255, 163, 51);
  flex: 0 0 3em;
}
</style>
