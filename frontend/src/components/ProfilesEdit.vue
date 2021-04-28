<template>
  <form id="editor">
    <span class="field">
      <label for="id">id</label>
      <span>{{ id }}</span>
    </span>
    <span class="field">
      <label for="tbtePayrollId">Payroll ID</label>
      <input
        type="number"
        name="tbtePayrollId"
        v-model.number="item.tbtePayrollId"
      />
    </span>
    <span class="field">
      <label for="salary">Salary</label>
      <input type="checkbox" name="salary" v-model="item.salary" />
    </span>
    <span class="field">
      <label for="timeSheetExpected">Time Sheet Expected</label>
      <input
        type="checkbox"
        name="timeSheetExpected"
        v-model="item.timeSheetExpected"
      />
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
      <span><input type="text" name="newClaim" v-model="newClaim" /></span>
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
      <label for="datepicker">Vehicle Insurance Expiry</label>
      <datepicker
        name="datepicker"
        input-class="calendar-input"
        wrapper-class="calendar-wrapper"
        placeholder="Date"
        :inline="false"
        v-model="item.personalVehicleInsuranceExpiry"
      />
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
import firebase from "../firebase";
const db = firebase.firestore();
import { PlusCircleIcon, XCircleIcon } from "vue-feather-icons";
import Datepicker from "vuejs-datepicker";

export default Vue.extend({
  components: {
    Datepicker,
    PlusCircleIcon,
    XCircleIcon,
  },
  props: ["id", "collection"],
  data() {
    return {
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      item: {} as firebase.firestore.DocumentData,
      newClaim: "",
      managers: [] as firebase.firestore.DocumentData[],
      divisions: [] as firebase.firestore.DocumentData[],
    };
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
    this.$bind("managers", db.collection("ManagerNames"));
    this.$bind("divisions", db.collection("Divisions"));
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
              this.item.personalVehicleInsuranceExpiry = result.personalVehicleInsuranceExpiry?.toDate();
            }
          })
          .catch(() => {
            this.$router.push(this.parentPath);
          });
      } else {
        this.item = {};
      }
    },
    addClaim(claim: string) {
      this.$set(this.item.customClaims, claim, true);
      this.newClaim = "";
    },
    save() {
      if (this.id) {
        if (this.collectionObject === null) {
          throw "There is no valid collection object";
        }

        // Editing an existing item
        // use update() instead of set({ merge: true }) because we want to
        // overwrite the entire customClaims section rather than keeping any
        // deleted claims
        const obj: {
          displayName: string;
          managerUid: string;
          email: string;
          customClaims: { [x: string]: boolean };
          defaultDivision: string;
          salary: boolean;
          timeSheetExpected: boolean;
          tbtePayrollId?: number;
          personalVehicleInsuranceExpiry?: Date;
        } = {
          displayName: this.item.displayName,
          managerUid: this.item.managerUid,
          email: this.item.email,
          customClaims: this.item.customClaims,
          salary: this.item.salary ?? false,
          timeSheetExpected: this.item.timeSheetExpected ?? true,
          defaultDivision: this.item.defaultDivision,
        };
        if (this.item.tbtePayrollId) {
          obj.tbtePayrollId = this.item.tbtePayrollId;
        }
        if (this.item.personalVehicleInsuranceExpiry) {
          obj.personalVehicleInsuranceExpiry = this.item.personalVehicleInsuranceExpiry;
        }
        this.collectionObject
          .doc(this.id)
          .update(obj)
          .then(() => {
            this.$router.push(this.parentPath);
          })
          .catch((err) => {
            alert(`Error saving item: ${err}`);
          });
      } else {
        alert("New profiles can only be created by the authentication system");
      }
    },
  },
});
</script>
