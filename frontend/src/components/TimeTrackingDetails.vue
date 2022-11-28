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
                  <action-button
                    type="delete"
                    title="reject this time sheet"
                    @click="$refs.rejectModal.openModal(tsId)"
                  />
                </td>
                <td>
                  <action-button
                    type="lock"
                    title="lock this time sheet"
                    @click="lockTimesheet(tsId)"
                  />
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
          <action-button
            type="removeuser"
            :title="`Ignore ${profile.displayName} this week`"
            @click="ignore(profile.id)"
          />
        </p>
        <br />
      </div>

      <!-- Show locked TimeSheets -->
      <div v-if="lockedProfiles.length > 0">
        <h5>Locked ({{ lockedProfiles.length }})</h5>
        <p v-for="profile in lockedProfiles" v-bind:key="profile.id">
          <router-link
            v-bind:to="{
              name: 'Time Sheet Details',
              params: { id: tsIdForUid(profile.id, item.timeSheets) },
            }"
          >
            {{ profile.surname }}, {{ profile.givenName }}
          </router-link>
          <action-button
            type="unlock"
            :title="`unlock ${profile.displayName}'s Timesheet`"
            @click="unlockTimesheet(tsIdForUid(profile.id, item.timeSheets))"
          />
        </p>
      </div>

      <!-- Show users marked as ignore for this week -->
      <div v-if="ignoredProfiles.length > 0">
        <h5>Ignored this week</h5>
        <p v-for="profile in ignoredProfiles" v-bind:key="profile.id">
          {{ profile.surname }}, {{ profile.givenName }}
          <action-button
            type="adduser"
            :title="`Expect ${profile.displayName} this week`"
            @click="restore(profile.id)"
          />
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
import Vue from "vue";
import { format, subWeeks, addMilliseconds } from "date-fns";
import { mapState } from "vuex";
import firebase from "../firebase";
import store from "../store";
import ActionButton from "./ActionButton.vue";
import _ from "lodash";

const db = firebase.firestore();

interface TimeSheetTrackingPayload {
  displayName: string;
  managerName: string;
  uid: string;
}

export default Vue.extend({
  components: {
    ActionButton,
    Modal,
  },
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
        .filter((s: firebase.firestore.DocumentData) =>
          this.submittedUserKeys.includes(s.id)
        )
        .filter((i: firebase.firestore.DocumentData) => i.msGraphDataUpdated) // surname isn't populated until msGraph update
        .sort(
          (
            a: firebase.firestore.DocumentData,
            b: firebase.firestore.DocumentData
          ) => a.surname.localeCompare(b.surname)
        );
    },
    lockedProfiles(): firebase.firestore.DocumentData[] {
      if (this?.item === undefined) {
        return [];
      }
      return this.profiles
        .filter((s: firebase.firestore.DocumentData) =>
          this.lockedUserKeys.includes(s.id)
        )
        .filter((i: firebase.firestore.DocumentData) => i.msGraphDataUpdated) // surname isn't populated until msGraph update
        .sort(
          (
            a: firebase.firestore.DocumentData,
            b: firebase.firestore.DocumentData
          ) => a.surname.localeCompare(b.surname)
        );
    },
    ignoredProfiles(): firebase.firestore.DocumentData[] {
      if (this?.item === undefined) {
        return [];
      }
      return this.profiles
        .filter(
          (p: firebase.firestore.DocumentData) =>
            !this.pendingUserKeys.includes(p.id)
        )
        .filter(
          (l: firebase.firestore.DocumentData) =>
            !this.lockedUserKeys.includes(l.id)
        )
        .filter(
          (s: firebase.firestore.DocumentData) =>
            !this.submittedUserKeys.includes(s.id)
        )
        .filter((t: firebase.firestore.DocumentData) =>
          this.item?.notMissingUids?.includes(t.id)
        )
        .filter((i: firebase.firestore.DocumentData) => i.msGraphDataUpdated) // surname isn't populated until msGraph update
        .sort(
          (
            a: firebase.firestore.DocumentData,
            b: firebase.firestore.DocumentData
          ) => a.surname.localeCompare(b.surname)
        );
    },
    missingProfiles(): firebase.firestore.DocumentData[] {
      if (this?.item === undefined) {
        return [];
      }
      return this.profiles
        .filter(
          (p: firebase.firestore.DocumentData) =>
            !this.pendingUserKeys.includes(p.id)
        )
        .filter(
          (l: firebase.firestore.DocumentData) =>
            !this.lockedUserKeys.includes(l.id)
        )
        .filter(
          (s: firebase.firestore.DocumentData) =>
            !this.submittedUserKeys.includes(s.id)
        )
        .filter(
          (t: firebase.firestore.DocumentData) =>
            !this.item?.notMissingUids?.includes(t.id)
        )
        .filter((i: firebase.firestore.DocumentData) => i.msGraphDataUpdated) // surname isn't populated until msGraph update
        .sort(
          (
            a: firebase.firestore.DocumentData,
            b: firebase.firestore.DocumentData
          ) => a.surname.localeCompare(b.surname)
        );
    },
    pendingUserKeys() {
      let pendingUserKeys = [] as string[];
      if (this?.item?.pending && Object.keys(this.item.pending).length > 0) {
        pendingUserKeys = (
          Object.values(this.item.pending) as TimeSheetTrackingPayload[]
        ).map((p) => p.uid);
      }
      return pendingUserKeys;
    },
    submittedUserKeys() {
      let submittedUserKeys = [] as string[];
      if (
        this?.item?.submitted &&
        Object.keys(this.item.submitted).length > 0
      ) {
        submittedUserKeys = (
          Object.values(this.item.submitted) as TimeSheetTrackingPayload[]
        ).map((p) => p.uid);
      }
      return submittedUserKeys;
    },
    lockedUserKeys() {
      let lockedUserKeys = [] as string[];
      if (
        this?.item?.timeSheets &&
        Object.keys(this.item.timeSheets).length > 0
      ) {
        lockedUserKeys = (
          Object.values(this.item.timeSheets) as TimeSheetTrackingPayload[]
        ).map((p) => p.uid);
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
    this.$bind("profiles", db.collection("Profiles")).catch(
      (error: unknown) => {
        if (error instanceof Error) {
          alert(`Can't load Profiles: ${error.message}`);
        } else alert(`Can't load Profiles: ${JSON.stringify(error)}`);
      }
    );
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
        .catch((error: unknown) => {
          if (error instanceof Error) {
            alert(`Error ignoring ${uid}: ${error.message}`);
          } else alert(`Error ignoring ${uid}: ${JSON.stringify(error)}`);
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
        .catch((error: unknown) => {
          if (error instanceof Error) {
            alert(`Error restoring ${uid}: ${error.message}`);
          } else alert(`Error restoring ${uid}: ${JSON.stringify(error)}`);
        });
    },
    tsIdForUid(uid: string, tsObj: Record<string, TimeSheetTrackingPayload>) {
      const keys = Object.keys(_.pickBy(tsObj, (i) => i.uid === uid));
      if (keys.length === 1) {
        return keys[0];
      }
      if (keys.length > 1) {
        alert(`Multiple time sheet keys [${keys.join()}] found for uid ${uid}`);
      }
      return null;
    },
    setItem(id: string) {
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }
      this.$bind("item", this.collectionObject.doc(id)).catch(
        (error: unknown) => {
          if (error instanceof Error) {
            alert(`Can't load TimeTracking document ${id}: ${error.message}`);
          } else
            alert(
              `Can't load TimeTracking document ${id}: ${JSON.stringify(error)}`
            );
        }
      );
    },
    async lockTimesheet(id: string) {
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
    unlockTimesheet(id: string) {
      const unlockTimesheet = firebase
        .functions()
        .httpsCallable("unlockTimesheet");
      if (
        confirm(
          "You must check with accounting prior to unlocking. Do you want to proceed?"
        )
      ) {
        store.commit("startTask", {
          id: `unlock${id}`,
          message: "unlocking",
        });
        return unlockTimesheet({ id })
          .then(() => {
            store.commit("endTask", { id: `unlock${id}` });
          })
          .catch((error) => {
            store.commit("endTask", { id: `unlock${id}` });
            alert(`Error unlocking timesheet: ${error.message}`);
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
