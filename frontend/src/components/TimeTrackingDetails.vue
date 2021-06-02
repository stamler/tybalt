<template>
  <div>
    <modal ref="rejectModal" collection="TimeSheets" />
    <h4 v-if="item.weekEnding">
      {{ weekStart | shortDate }} to {{ item.weekEnding.toDate() | shortDate }}
    </h4>
    <div>
      <!-- Show submitted unapproved TimeSheets -->
      <div v-if="submittedProfiles.length > 0">
        <h5>Submitted ({{ submittedProfiles.length }})</h5>
        <p v-for="profile in submittedProfiles" v-bind:key="profile.id">
          {{ profile.surname }}, {{ profile.givenName }} awaiting approval by
          {{
            item.submitted[tsIdForUid(profile.id, item.submitted)].managerName
          }}
        </p>
        <br />
      </div>

      <!-- Show approved unlocked TimeSheets -->
      <div
        v-if="this.item.pending && Object.keys(this.item.pending).length > 0"
      >
        <h5>Approved ({{ Object.keys(this.item.pending).length }})</h5>
        <div class="horizontalScroll">
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
              <tr v-for="tsId of pendingTsIdsSortedByName" v-bind:key="tsId">
                <td>
                  <router-link
                    v-bind:to="{
                      name: 'Time Sheet Details',
                      params: { id: tsId },
                    }"
                  >
                    {{ item.pending[tsId].displayName }}
                  </router-link>
                </td>
                <td>{{ item.pending[tsId].hoursWorked }}</td>
                <td>{{ item.pending[tsId].OH }}</td>
                <td>{{ item.pending[tsId].OP }}</td>
                <td>{{ item.pending[tsId].OV }}</td>
                <td>{{ item.pending[tsId].OS }}</td>
                <td>{{ item.pending[tsId].RB }}</td>
                <td>{{ item.pending[tsId].payoutRequest }}</td>
                <td>{{ item.pending[tsId].OB }}</td>
                <td>{{ item.pending[tsId].offRotationDaysTally }}</td>
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
        </div>
        <br />
      </div>

      <!-- Show users with missing TimeSheets -->
      <div v-if="missingProfiles.length > 0">
        <h5>
          Missing ({{
            missingProfiles.filter((t) => t.timeSheetExpected).length
          }})
        </h5>
        <p
          v-for="profile in missingProfiles.filter((t) => t.timeSheetExpected)"
          v-bind:key="profile.id"
        >
          <a
            :href="`mailto:${
              profile.email
            }?subject=Please submit a timesheet for the week ending ${$options.filters.shortDate(
              item.weekEnding.toDate()
            )}&body=Hi ${
              profile.givenName
            }, you have not yet submitted a timesheet. Please submit a timesheet as soon as possible by visiting https://tybalt.tbte.ca.`"
          >
            {{ profile.surname }}, {{ profile.givenName }}
          </a>
          <router-link
            v-bind:to="{
              name: 'Time Tracking Details',
              params: { id },
            }"
            v-bind:title="`Ignore ${profile.displayName} this week`"
            v-on:click.native="ignore(profile.id)"
          >
            <user-minus-icon></user-minus-icon>
          </router-link>
        </p>
        <br />
      </div>

      <!-- Show locked TimeSheets -->
      <div v-if="lockedProfiles.length > 0">
        <h5>Locked ({{ lockedProfiles.length }})</h5>
        <router-link
          v-for="profile in lockedProfiles"
          v-bind:key="profile.id"
          v-bind:to="{
            name: 'Time Sheet Details',
            params: { id: tsIdForUid(profile.id, item.timeSheets) },
          }"
        >
          {{ profile.surname }}, {{ profile.givenName }}<br />
        </router-link>
        <br />
      </div>

      <!-- Show users marked as ignore for this week -->
      <div v-if="ignoredProfiles.length > 0">
        <h5>Ignored this week</h5>
        <p v-for="profile in ignoredProfiles" v-bind:key="profile.id">
          {{ profile.surname }}, {{ profile.givenName }}
          <router-link
            v-bind:to="{
              name: 'Time Tracking Details',
              params: { id },
            }"
            v-bind:title="`Expect ${profile.displayName} this week`"
            v-on:click.native="restore(profile.id)"
          >
            <user-plus-icon></user-plus-icon>
          </router-link>
        </p>
        <br />
      </div>

      <!-- Show users not expected to submit TimeSheets -->
      <div>
        <h5>Not expected</h5>
        <p
          v-for="profile in missingProfiles.filter((t) => !t.timeSheetExpected)"
          v-bind:key="profile.id"
        >
          {{ profile.surname }}, {{ profile.givenName }}
        </p>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Modal from "./RejectModal.vue";
import mixins from "./mixins";
import { format, subWeeks, addMilliseconds } from "date-fns";
import { mapState } from "vuex";
import firebase from "../firebase";
import store from "../store";
import {
  LockIcon,
  XCircleIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "vue-feather-icons";
import _ from "lodash";

const db = firebase.firestore();

interface TimeSheetTrackingPayload {
  displayName: string;
  managerName: string;
  uid: string;
}

export default mixins.extend({
  components: { XCircleIcon, LockIcon, UserMinusIcon, UserPlusIcon, Modal },
  props: ["id", "collection"],
  computed: {
    ...mapState(["user", "claims"]),
    pendingTsIdsSortedByName(): string[] {
      const pending = this?.item?.pending;
      if (pending === undefined) {
        return [];
      }
      return Object.keys(pending).sort((a, b) =>
        pending[a].displayName.localeCompare(pending[b].displayName)
      );
    },
    submittedProfiles(): firebase.firestore.DocumentData[] {
      if (this?.item === undefined) {
        return [];
      }
      return this.profiles
        .filter((s) => this.submittedUserKeys.includes(s.id))
        .filter((i) => i.msGraphDataUpdated) // surname isn't populated until msGraph update
        .sort((a, b) => a.surname.localeCompare(b.surname));
    },
    lockedProfiles(): firebase.firestore.DocumentData[] {
      if (this?.item === undefined) {
        return [];
      }
      return this.profiles
        .filter((s) => this.lockedUserKeys.includes(s.id))
        .filter((i) => i.msGraphDataUpdated) // surname isn't populated until msGraph update
        .sort((a, b) => a.surname.localeCompare(b.surname));
    },
    ignoredProfiles(): firebase.firestore.DocumentData[] {
      if (this?.item === undefined) {
        return [];
      }
      return this.profiles
        .filter((p) => !this.pendingUserKeys.includes(p.id))
        .filter((l) => !this.lockedUserKeys.includes(l.id))
        .filter((s) => !this.submittedUserKeys.includes(s.id))
        .filter((t) => this.item?.notMissingUids?.includes(t.id))
        .filter((i) => i.msGraphDataUpdated) // surname isn't populated until msGraph update
        .sort((a, b) => a.surname.localeCompare(b.surname));
    },
    missingProfiles(): firebase.firestore.DocumentData[] {
      if (this?.item === undefined) {
        return [];
      }
      return this.profiles
        .filter((p) => !this.pendingUserKeys.includes(p.id))
        .filter((l) => !this.lockedUserKeys.includes(l.id))
        .filter((s) => !this.submittedUserKeys.includes(s.id))
        .filter((t) => !this.item?.notMissingUids?.includes(t.id))
        .filter((i) => i.msGraphDataUpdated) // surname isn't populated until msGraph update
        .sort((a, b) => a.surname.localeCompare(b.surname));
    },
    pendingUserKeys() {
      let pendingUserKeys = [] as string[];
      if (this?.item?.pending && Object.keys(this.item.pending).length > 0) {
        pendingUserKeys = (Object.values(
          this.item.pending
        ) as TimeSheetTrackingPayload[]).map((p) => p.uid);
      }
      return pendingUserKeys;
    },
    submittedUserKeys() {
      let submittedUserKeys = [] as string[];
      if (
        this?.item?.submitted &&
        Object.keys(this.item.submitted).length > 0
      ) {
        submittedUserKeys = (Object.values(
          this.item.submitted
        ) as TimeSheetTrackingPayload[]).map((p) => p.uid);
      }
      return submittedUserKeys;
    },
    lockedUserKeys() {
      let lockedUserKeys = [] as string[];
      if (
        this?.item?.timeSheets &&
        Object.keys(this.item.timeSheets).length > 0
      ) {
        lockedUserKeys = (Object.values(
          this.item.timeSheets
        ) as TimeSheetTrackingPayload[]).map((p) => p.uid);
      }
      return lockedUserKeys;
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
    ignore(uid: string) {
      // add uid to notMissingUids property
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }
      return this.collectionObject
        .doc(this.id)
        .update({
          notMissingUids: firebase.firestore.FieldValue.arrayUnion(uid),
        })
        .catch((error) => {
          alert(`Error ignoring ${uid}: ${error.message}`);
        });
    },
    restore(uid: string) {
      // remove uid from notMissingUids property
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }
      return this.collectionObject
        .doc(this.id)
        .update({
          notMissingUids: firebase.firestore.FieldValue.arrayRemove(uid),
        })
        .catch((error) => {
          alert(`Error restoring ${uid}: ${error.message}`);
        });
    },
    tsIdForUid(uid: string, tsObj: Record<string, TimeSheetTrackingPayload>) {
      const keys = Object.keys(_.pickBy(tsObj, (i) => i.uid === uid));
      if (keys.length === 1) {
        return keys[0];
      }
      return null;
    },
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
