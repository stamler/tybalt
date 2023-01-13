<template>
  <form id="editor">
    <span class="field">
      <label for="id">id</label>
      <span>{{ id }}</span>
    </span>
    <span class="field">
      <label for="tbtePayrollId">Payroll ID</label>
      <input
        class="grow"
        type="number"
        name="tbtePayrollId"
        v-model.number="item.tbtePayrollId"
      />
    </span>
    <!-- <span class="field">
      <label for="datepicker">Vehicle Insurance Expiry</label>
      <datepicker
        name="datepicker"
        input-class="calendar-input"
        wrapper-class="calendar-wrapper"
        placeholder="Date"
        :inline="false"
        v-model="item.personalVehicleInsuranceExpiry"
      />
    </span> -->
    <span class="field">
      <label for="salary">Salary</label>
      <input class="grow" type="checkbox" name="salary" v-model="item.salary" />
    </span>
    <span class="field">
      <label for="offRotation">Off Rotation</label>
      <input
        class="grow"
        type="checkbox"
        name="offRotation"
        v-model="item.offRotation"
      />
    </span>
    <span class="field">
      <label for="timeSheetExpected">Time Sheet Expected</label>
      <input
        class="grow"
        type="checkbox"
        name="timeSheetExpected"
        v-model="item.timeSheetExpected"
      />
    </span>
    <span class="field">
      <label for="allowPersonalReimbursement">
        Allow Personal Reimbursement
      </label>
      <input
        class="grow"
        type="checkbox"
        name="allowPersonalReimbursement"
        v-model="item.allowPersonalReimbursement"
      />
    </span>
    <span class="field">
      <label for="untrackedTimeOff">
        Do not track Time Off (and skip workWeekHours checks)
      </label>
      <input
        class="grow"
        type="checkbox"
        name="untrackedTimeOff"
        v-model="item.untrackedTimeOff"
      />
    </span>
    <span class="field">
      <label for="skipMinTimeCheckOnNextBundle">
        Skip 40-hour check next bundle
      </label>
      <input
        class="grow"
        type="checkbox"
        name="skipMinTimeCheckOnNextBundle"
        v-model="item.skipMinTimeCheckOnNextBundle"
      />
    </span>
    <span class="field">
      <label for="workWeekHours">Work Week Hours</label>
      <input
        class="grow"
        type="number"
        name="workWeekHours"
        v-model.number="item.workWeekHours"
      />
    </span>
    <span class="field">
      <label for="doNotAcceptSubmissions">Block Submissions</label>
      <input
        class="grow"
        type="checkbox"
        name="doNotAcceptSubmissions"
        v-model="item.doNotAcceptSubmissions"
      />
    </span>
    <span class="field">
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
      <label for="displayName">Name</label>
      <input
        class="grow"
        type="text"
        name="displayName"
        v-model="item.displayName"
      />
    </span>
    <span class="field">
      <label for="email">Email</label>
      <input class="grow" type="text" name="email" v-model="item.email" />
    </span>
    <span class="field">
      <label for="manager">Manager</label>
      <select class="grow" name="manager" v-model="item.managerUid">
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
          <Icon icon="feather:x-circle" width="24px" />
        </span>
      </span>
      <span><input type="text" name="newClaim" v-model="newClaim" /></span>
      <span v-on:click="addClaim(newClaim)">
        <Icon icon="feather:plus-circle" width="24px" />
      </span>
    </span>
    <span class="field">
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
import { firebaseApp } from "../firebase";
import { useCollection } from "vuefire";
import {
  updateDoc,
  getFirestore,
  collection,
  doc,
  getDoc,
  CollectionReference,
  DocumentData,
  DocumentSnapshot,
} from "firebase/firestore";
const db = getFirestore(firebaseApp);
import { Icon } from "@iconify/vue";
// import Datepicker from "vuejs-datepicker";

export default defineComponent({
  components: {
    // Datepicker,
    Icon,
  },
  props: ["id", "collectionName"],
  data() {
    return {
      parentPath: "",
      collectionObject: null as CollectionReference | null,
      item: {} as DocumentData,
      newClaim: "",
      managers: useCollection(collection(db, "ManagerNames")),
      divisions: useCollection(collection(db, "Divisions")),
    };
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
        getDoc(doc(this.collectionObject, id))
          .then((snap: DocumentSnapshot) => {
            const result = snap.data();
            if (result === undefined) {
              // A document with this id doesn't exist in the database,
              // list instead.
              this.$router.push(this.parentPath);
            } else {
              this.item = result;
              this.item.personalVehicleInsuranceExpiry =
                result.personalVehicleInsuranceExpiry?.toDate();
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
      this.item.customClaims[claim] = true;
      // this.$set(this.item.customClaims, claim, true);
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
          skipMinTimeCheckOnNextBundle?: boolean;
          workWeekHours?: number;
          doNotAcceptSubmissions?: boolean;
          alternateManager?: string;
          offRotation?: boolean;
          timeSheetExpected: boolean;
          allowPersonalReimbursement?: boolean;
          untrackedTimeOff?: boolean;
          tbtePayrollId?: number;
          personalVehicleInsuranceExpiry?: Date;
        } = {
          displayName: this.item.displayName,
          managerUid: this.item.managerUid,
          email: this.item.email,
          customClaims: this.item.customClaims,
          salary: this.item.salary ?? false,
          offRotation: this.item.offRotation ?? false,
          timeSheetExpected: this.item.timeSheetExpected ?? true,
          defaultDivision: this.item.defaultDivision,
        };
        if (typeof this.item.allowPersonalReimbursement === "boolean") {
          obj.allowPersonalReimbursement = this.item.allowPersonalReimbursement;
        }
        if (typeof this.item.untrackedTimeOff === "boolean") {
          obj.untrackedTimeOff = this.item.untrackedTimeOff;
        }
        if (typeof this.item.doNotAcceptSubmissions === "boolean") {
          obj.doNotAcceptSubmissions = this.item.doNotAcceptSubmissions;
        }
        if (typeof this.item.alternateManager === "string") {
          obj.alternateManager = this.item.alternateManager;
        }
        if (typeof this.item.skipMinTimeCheckOnNextBundle === "boolean") {
          obj.skipMinTimeCheckOnNextBundle =
            this.item.skipMinTimeCheckOnNextBundle;
        }
        if (typeof this.item.workWeekHours === "number") {
          obj.workWeekHours = this.item.workWeekHours;
        }
        if (this.item.tbtePayrollId) {
          obj.tbtePayrollId = this.item.tbtePayrollId;
        }
        if (this.item.personalVehicleInsuranceExpiry) {
          obj.personalVehicleInsuranceExpiry =
            this.item.personalVehicleInsuranceExpiry;
        }
        updateDoc(doc(this.collectionObject, this.id), obj)
          .then(() => {
            this.$router.push(this.parentPath);
          })
          .catch((error: unknown) => {
            if (error instanceof Error) {
              alert(`Error saving item: ${error.message}`);
            } else {
              alert(`Error saving item: ${JSON.stringify(error)}`);
            }
          });
      } else {
        alert("New profiles can only be created by the authentication system");
      }
    },
  },
});
</script>
