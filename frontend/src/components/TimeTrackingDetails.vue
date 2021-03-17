<template>
  <div>
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
        <h5>Submitted</h5>
        <p v-for="(obj, tsId) in item.submitted" v-bind:key="tsId">
          {{ obj.displayName }} awaiting approval by {{ obj.managerName }}
        </p>
        <br />
      </div>

      <!-- Show approved unlocked TimeSheets -->
      <div
        v-if="this.item.pending && Object.keys(this.item.pending).length > 0"
      >
        <h5>Approved</h5>
        <router-link
          v-for="(obj, tsId) in item.pending"
          v-bind:key="tsId"
          v-bind:to="{ name: 'Time Sheet Details', params: { id: tsId } }"
        >
          {{ obj.displayName }}<br />
        </router-link>
        <br />
      </div>

      <!-- Show locked TimeSheets -->
      <div
        v-if="
          this.item.timeSheets && Object.keys(this.item.timeSheets).length > 0
        "
      >
        <h5>Locked</h5>
        <router-link
          v-for="(obj, tsId) in item.timeSheets"
          v-bind:key="tsId"
          v-bind:to="{ name: 'Time Sheet Details', params: { id: tsId } }"
        >
          {{ obj.displayName }}<br />
        </router-link>
        <br />
      </div>

      <!-- Show users with missing TimeSheets -->
      <div v-if="missing.length > 0">
        <h5>Missing</h5>
        <p v-for="m in missing" v-bind:key="m.id">{{ m.displayName }}</p>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import mixins from "./mixins";
import { format, subWeeks, addMilliseconds } from "date-fns";
import { mapState } from "vuex";
import firebase from "../firebase";
const db = firebase.firestore();

interface TimeSheetTrackingPayload {
  displayName: string;
  uid: string;
}

export default mixins.extend({
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
      if (id) {
        this.collectionObject
          .doc(id)
          .get()
          .then((snap) => {
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
