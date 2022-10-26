<template>
  <form id="editor">
    <span class="field">
      <label for="surname">Surname</label>
      <input
        class="grow"
        type="text"
        name="surname"
        v-model.trim="item.surname"
        placeholder="Goodman"
      />
    </span>
    <span class="field">
      <label for="givenName">Given Names</label>
      <input
        class="grow"
        type="text"
        name="givenName"
        v-model.trim="item.givenName"
        placeholder="Burt"
      />
    </span>
    <span class="field">
      <label for="department">Department</label>
      <input
        class="grow"
        type="text"
        name="department"
        v-model.trim="item.department"
        placeholder="Optics and Design"
      />
    </span>
    <span class="field">
      <label for="title">Title</label>
      <input
        class="grow"
        type="text"
        name="title"
        v-model.trim="item.title"
        placeholder="Manager"
      />
    </span>
    <span class="field">
      <select class="grow" name="division" v-model="item.defaultDivision">
        <option disabled selected value="">-- choose division --</option>
        <option v-for="d in divisions" :value="d.id" v-bind:key="d.id">
          {{ d.name }}
        </option>
      </select>
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
      <label for="remuneration">Remuneration:</label>
      <select class="grow" name="remuneration" v-model="item.remuneration">
        <option value="Hourly">Hourly</option>
        <option value="Salary">Salary</option>
      </select>
    </span>
    <span class="field">
      <label for="tbtePayrollId">Payroll ID</label>
      <input
        class="grow"
        type="text"
        name="tbtePayrollId"
        v-model.trim="item.tbtePayrollId"
        placeholder="900"
      />
    </span>
    <span class="field">
      <label for="areaCode">Area Code</label>
      <input
        class="grow"
        type="text"
        name="areaCode"
        v-model.trim="item.areaCode"
        step="1"
        min="201"
        max="999"
        placeholder="807"
      />
    </span>
    <span class="field">
      <label for="centralOffice">Central Office</label>
      <input
        class="grow"
        type="text"
        name="centralOffice"
        step="1"
        min="200"
        max="999"
        placeholder="577"
        v-model.trim="item.centralOffice"
      />
    </span>
    <span class="field">
      <label for="station">Station</label>
      <input
        class="grow"
        type="text"
        name="station"
        step="1"
        min="0"
        max="9999"
        placeholder="1234"
        v-model.trim="item.station"
      />
    </span>
    <span class="field">
      <label for="license">License:</label>
      <select class="grow" name="license" v-model="item.license">
        <option value="O365_BUSINESS_ESSENTIALS">
          Microsoft 365 Business Basic
        </option>
        <option value="O365_BUSINESS_PREMIUM">
          Microsoft 365 Business Standard
        </option>
        <option value="SPB">Microsoft 365 Business Premium</option>
      </select>
    </span>

    <span class="field">
      <button v-if="id === undefined" type="button" v-on:click="save()">
        Queue for Creation
      </button>
      <button v-else type="button" v-on:click="save()">Queue for Edit</button>
      <button type="button" v-on:click="$router.push(parentPath)">
        Cancel
      </button>
    </span>
  </form>
</template>

<script lang="ts">
import Vue from "vue";
import store from "../store";
import firebase from "../firebase";
import _ from "lodash";
const db = firebase.firestore();

export default Vue.extend({
  props: ["id", "collection"],
  data() {
    return {
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      managers: [] as firebase.firestore.DocumentData[],
      divisions: [] as firebase.firestore.DocumentData[],
      item: {} as firebase.firestore.DocumentData,
    };
  },
  watch: {
    id: function (id) {
      this.setItem(id);
    },
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
    async setItem(id: string) {
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
              // format telephoneNumber into areaCode, centralOffice, station
              this.item.areaCode = this.item.telephoneNumber.substr(4, 3);
              this.item.centralOffice = this.item.telephoneNumber.substr(9, 3);
              this.item.station = this.item.telephoneNumber.substr(13, 4);
              delete this.item.telephoneNumber;
            }
          })
          .catch(() => {
            this.$router.push(this.parentPath);
          });
      } else {
        this.item = {};
      }
    },
    async save() {
      let verb = "create";
      if (this.id) {
        verb = "edit";
        // remove properties that are not allowed in edits
        this.item = _.pick(this.item, [
          "givenName",
          "surname",
          "department",
          "title",
          "areaCode",
          "centralOffice",
          "station",
        ]);
      }
      // populate the Manager Name
      const manager = this.managers.find(
        (m: firebase.firestore.DocumentData) => m.id === this.item.managerUid
      );
      this.item.managerName = manager?.displayName ?? null;
      const mutation = this.id
        ? { verb, userId: this.id, data: this.item }
        : { verb, data: this.item };
      store.commit("startTask", {
        id: `${verb}User${this.id}`,
        message: "Creating Mutation...",
      });
      const addMutation = firebase.functions().httpsCallable("addMutation");
      return addMutation(mutation)
        .then(() => {
          store.commit("endTask", { id: `${verb}User${this.id}` });
          this.$router.push({ name: "User Mutations" });
        })
        .catch((error) => {
          store.commit("endTask", { id: `${verb}User${this.id}` });
          alert(`Error creating mutation: ${error.message}`);
        });
    },
  },
});
</script>
