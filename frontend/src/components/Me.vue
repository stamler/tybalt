<template>
  <div>
    <div id="spacer"></div>
    <div class="actions">
      <router-link to="#" v-on:click.native="signOutWrapper">
        Sign Out
      </router-link>
    </div>
    <div id="dash">
      <h2>Hi, {{ user.displayName }}</h2>
      <img alt="TBTE logo" src="../assets/logo.png" />
      <div
        style="
          width: 100%;
          padding: 0em 0.4em;
          margin-bottom: 2em;
          background-color: ivory;
        "
      >
        <h3>Balances</h3>
        <h4>Available time off as of {{ item.usedAsOf | shortDate }}</h4>
        <p>Vacation: {{ item.openingOV - item.usedOV }} hr(s)</p>
        <p>PPTO: {{ item.openingOP - item.usedOP }} hr(s)</p>
        <p>
          Company policy requires the use of vacation time prior to using PPTO
        </p>
        <br />
        <h4>
          Mileage Claimed since {{ item.mileageClaimedSince | shortDate }}
        </h4>
        <p>{{ item.mileageClaimed }} km</p>
      </div>
      <form id="editor">
        <h3>Settings</h3>
        <h4>Time Sheets</h4>
        <span class="field" title="The manager who will approve your timesheet">
          <label for="manager">Manager</label>
          <select class="grow" name="manager" v-model="item.managerUid">
            <option v-for="m in managers" :value="m.id" v-bind:key="m.id">
              {{ m.displayName }}
            </option>
          </select>
        </span>
        <span
          class="field"
          title="New Time Entries will be use this division by default"
        >
          <label for="defaultDivision">Default Division</label>
          <select
            class="grow"
            name="defaultDivision"
            v-model="item.defaultDivision"
          >
            <option v-for="d in divisions" :value="d.id" v-bind:key="d.id">
              {{ d.name }}
            </option>
          </select>
        </span>
        <span
          class="field"
          v-if="isManager"
          title="Prevent staff from submitting timesheets and expenses to you"
        >
          <label for="doNotAcceptSubmissions">Block Submissions</label>
          <input
            class="grow"
            type="checkbox"
            name="doNotAcceptSubmissions"
            v-model="item.doNotAcceptSubmissions"
          />
        </span>
        <span
          class="field"
          v-if="isManager"
          title="Who should receive time and expenses when you're not available?"
        >
          <label for="alternateManager">Alternate Manager</label>
          <select
            class="grow"
            name="alternateManager"
            v-model="item.alternateManager"
          >
            <option v-for="m in managers" :value="m.id" v-bind:key="m.id">
              {{ m.displayName }}
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
    <div style="text-align: right">v{{ VERSION }}</div>
  </div>
</template>
<script lang="ts">
import { LIB_VERSION } from "../version";
import Vue from "vue";
import { signOut } from "../main";
import { mapState } from "vuex";
import firebase from "../firebase";
import { format } from "date-fns";

const db = firebase.firestore();

export default Vue.extend({
  data() {
    return {
      VERSION: LIB_VERSION,
      item: {} as firebase.firestore.DocumentData,
      managers: [] as firebase.firestore.DocumentData[],
      divisions: [] as firebase.firestore.DocumentData[],
    };
  },
  computed: {
    ...mapState(["user"]),
    isManager(): boolean {
      return this.item?.customClaims?.tapr === true;
    },
  },
  created() {
    this.$bind("managers", db.collection("ManagerNames"));
    this.$bind("divisions", db.collection("Divisions"));
    this.setItem(this.user.uid);
  },
  filters: {
    shortDate(date: firebase.firestore.Timestamp | undefined): string {
      if (date === undefined) return "";
      return format(date.toDate(), "MMM dd");
    },
  },
  methods: {
    signOut,
    async signOutWrapper() {
      // wrap the signOut because it was causing issues of not working at all
      // may be because the function depended on async stuff being loaded
      // but it's not clear why
      signOut();
    },
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
    save(): void {
      // Editing an existing item
      // Since the UI binds existing id to the key field, no need to delete
      const obj: {
        defaultDivision: string;
        managerUid: string;
        doNotAcceptSubmissions?: boolean;
        alternateManager?: string;
      } = {
        defaultDivision: this.item.defaultDivision,
        managerUid: this.item.managerUid,
      };
      if (typeof this.item.doNotAcceptSubmissions === "boolean") {
        obj.doNotAcceptSubmissions = this.item.doNotAcceptSubmissions;
      }
      if (typeof this.item.alternateManager === "string") {
        obj.alternateManager = this.item.alternateManager;
      }
      db.collection("Profiles")
        .doc(this.user.uid)
        .set(obj, { merge: true })
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
