<template>
  <div>
    <modal ref="rejectModal" />
    <h4 v-if="item.weekEnding">
      {{ weekStart | shortDate }} to {{ item.weekEnding.toDate() | shortDate }}
    </h4>
    <div>
      <!-- Show submitted unapproved TimeSheets -->
      <div
        v-if="
          this.item.submitted && Object.keys(this.item.submitted).length > 0
        "
      >
        <h5>Submitted ({{ Object.keys(this.item.submitted).length }})</h5>
        <p v-for="(obj, tsId) in item.submitted" v-bind:key="tsId">
          {{ obj.displayName }} awaiting approval by {{ obj.managerName }}
        </p>
        <br />
      </div>

      <!-- Show approved unlocked TimeSheets -->
      <div
        v-if="this.item.pending && Object.keys(this.item.pending).length > 0"
      >
        <h5>Approved ({{ Object.keys(this.item.pending).length }})</h5>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>hours worked</th>
              <th>stat</th>
              <th>ppto</th>
              <th>vacation</th>
              <th>sick</th>
              <th>to bank</th>
              <th>OT payout request</th>
              <th>bereavement</th>
              <th>days off rotation</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(entry, tsId) in this.item.pending" v-bind:key="tsId">
              <td>
                <router-link
                  v-bind:to="{
                    name: 'Time Sheet Details',
                    params: { id: tsId },
                  }"
                  >{{ entry.displayName }}</router-link
                >
              </td>
              <td>{{ entry.hoursWorked }}</td>
              <td>{{ entry.OH }}</td>
              <td>{{ entry.OP }}</td>
              <td>{{ entry.OV }}</td>
              <td>{{ entry.OS }}</td>
              <td>{{ entry.RB }}</td>
              <td>{{ entry.payoutRequest }}</td>
              <td>{{ entry.OB }}</td>
              <td>{{ entry.offRotationDaysTally }}</td>
              <td>
                <router-link
                  v-bind:to="{
                    name: 'Time Tracking Details',
                    params: { id },
                  }"
                  v-on:click.native="$refs.rejectModal.openModal(tsId)"
                >
                  <x-circle-icon></x-circle-icon>
                </router-link>
              </td>
              <td>
                <router-link
                  v-bind:to="{
                    name: 'Time Tracking Details',
                    params: { id },
                  }"
                  v-on:click.native="lockTimesheet(tsId)"
                >
                  <lock-icon></lock-icon>
                </router-link>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- <router-link
          v-for="(obj, tsId) in item.pending"
          v-bind:key="tsId"
          v-bind:to="{ name: 'Time Sheet Details', params: { id: tsId } }"
        >
          {{ obj.displayName }}<br />
        </router-link> -->
        <br />
      </div>

      <!-- Show users with missing TimeSheets -->
      <div v-if="missing.length > 0">
        <h5>
          Missing ({{ missing.filter((t) => t.timeSheetExpected).length }})
        </h5>
        <p
          v-for="m in missing.filter((t) => t.timeSheetExpected)"
          v-bind:key="m.id"
        >
          {{ m.displayName }}
        </p>
        <br />
      </div>

      <!-- Show locked TimeSheets -->
      <div
        v-if="
          this.item.timeSheets && Object.keys(this.item.timeSheets).length > 0
        "
      >
        <h5>Locked ({{ Object.keys(this.item.timeSheets).length }})</h5>
        <router-link
          v-for="(obj, tsId) in item.timeSheets"
          v-bind:key="tsId"
          v-bind:to="{ name: 'Time Sheet Details', params: { id: tsId } }"
        >
          {{ obj.displayName }}<br />
        </router-link>
        <br />
      </div>

      <!-- Show users not expected to submit TimeSheets -->
      <div>
        <h5>Not expected</h5>
        <p
          v-for="n in missing.filter((t) => !t.timeSheetExpected)"
          v-bind:key="n.id"
        >
          {{ n.displayName }}
        </p>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Modal from "./Modal.vue";
import mixins from "./mixins";
import { format, subWeeks, addMilliseconds } from "date-fns";
import { mapState } from "vuex";
import firebase from "../firebase";
import store from "../store";
import { LockIcon, XCircleIcon } from "vue-feather-icons";

const db = firebase.firestore();

interface TimeSheetTrackingPayload {
  displayName: string;
  uid: string;
}

export default mixins.extend({
  components: { XCircleIcon, LockIcon, Modal },
  props: ["id", "collection"],
  computed: {
    ...mapState(["user", "claims"]),
    missing(): firebase.firestore.DocumentData[] {
      if (this && this.item) {
        let pendingUserKeys = [] as string[];
        if (this.item.pending && Object.keys(this.item.pending).length > 0) {
          pendingUserKeys = (Object.values(
            this.item.pending
          ) as TimeSheetTrackingPayload[]).map((p) => p.uid);
        }
        let lockedUserKeys = [] as string[];
        if (
          this.item.timeSheets &&
          Object.keys(this.item.timeSheets).length > 0
        ) {
          lockedUserKeys = (Object.values(
            this.item.timeSheets
          ) as TimeSheetTrackingPayload[]).map((p) => p.uid);
        }
        let submittedUserKeys = [] as string[];
        if (
          this.item.submitted &&
          Object.keys(this.item.submitted).length > 0
        ) {
          submittedUserKeys = (Object.values(
            this.item.submitted
          ) as TimeSheetTrackingPayload[]).map((p) => p.uid);
        }
        return this.profiles
          .filter((p) => !pendingUserKeys.includes(p.id))
          .filter((l) => !lockedUserKeys.includes(l.id))
          .filter((s) => !submittedUserKeys.includes(s.id));
      }
      return [];
    },
    weekStart(): Date {
      if (this.item?.weekEnding !== undefined) {
        return addMilliseconds(subWeeks(this.item.weekEnding.toDate(), 1), 1);
      } else {
        return new Date();
      }
    },
  },
  data() {
    return {
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      item: {} as firebase.firestore.DocumentData | undefined,
      profiles: [] as firebase.firestore.DocumentData[],
    };
  },
  filters: {
    shortDate(date: Date) {
      return format(date, "MMM dd, yyyy");
    },
  },
  watch: {
    id: function (id: string) {
      this.setItem(id);
    }, // first arg is newVal, second is oldVal
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.setItem(this.id);
    this.$bind("profiles", db.collection("Profiles")).catch((error) => {
      alert(`Can't load Profiles: ${error.message}`);
    });
  },
  methods: {
    setItem(id: string) {
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }
      this.$bind("item", this.collectionObject.doc(id)).catch((error) => {
        alert(`Can't load TimeTracking document ${id}: ${error.message}`);
      });
    },
    lockTimesheet(id: string) {
      const lockTimesheet = firebase.functions().httpsCallable("lockTimesheet");
      // TODO: replace confirm() with modal in Vue
      if (
        confirm("Locking Timesheets is not reversible. Do you want to proceed?")
      ) {
        store.commit("startTask", {
          id: `lock${id}`,
          message: "locking + exporting",
        });
        return lockTimesheet({ id })
          .then(() => {
            store.commit("endTask", { id: `lock${id}` });
          })
          .catch((error) => {
            store.commit("endTask", { id: `lock${id}` });
            alert(`Error exporting timesheets: ${error.message}`);
          });
      }
    },
  },
});
</script>
<style scoped>
th,
td,
tr {
  text-align: center;
  background-color: lightgray;
}
.anchorbox {
  flex-basis: 6.5em;
}
</style>
