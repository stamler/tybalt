<template>
  <div id="list">
    <modal ref="rejectModal" collection="Expenses" />
    <div
      class="listentry"
      v-for="item in items"
      v-bind:key="item.id"
      v-bind:class="{
        week2: isPayrollWeek2(item.committedWeekEnding.toDate()),
      }"
    >
      <div class="anchorbox">
        {{ item.date.toDate() | shortDate }}
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">
            <template v-if="approved === undefined">
              <template
                v-if="!['Meals', 'Allowance'].includes(item.paymentType)"
              >
                {{ item.description }}
              </template>
              <template v-else>
                {{ item.breakfast ? "Breakfast" : "" }}
                {{ item.lunch ? "Lunch" : "" }}
                {{ item.dinner ? "Dinner" : "" }}
                {{ item.lodging ? "Personal Accommodation" : "" }}
              </template>
            </template>
            <template v-else>
              {{ item.displayName }}
            </template>
          </div>
          <div class="byline" v-if="item.paymentType === 'Mileage'">
            {{ item.distance }} km
          </div>
          <div
            class="byline"
            v-else-if="['Meals', 'Allowance'].includes(item.paymentType)"
          >
            <template v-if="typeof approved === 'boolean'">
              {{ item.breakfast ? "Breakfast" : "" }}
              {{ item.lunch ? "Lunch" : "" }}
              {{ item.dinner ? "Dinner" : "" }}
              {{ item.lodging ? "Personal Accommodation" : "" }}
            </template>
          </div>
          <div class="byline" v-else>
            ${{ item.total }}
            <span v-if="item.po">/PO:{{ item.po }}</span>
            <span v-if="item.vendorName">/vendor: {{ item.vendorName }}</span>
          </div>
        </div>
        <div class="firstline">
          <template v-if="approved !== undefined">
            {{ item.description }}
          </template>
        </div>
        <div class="secondline">
          <template v-if="item.job !== undefined">
            {{ item.job }} {{ item.jobDescription }} for {{ item.client }}
          </template>
          <template v-if="item.attachment">
            <router-link to="#" v-on:click.native="downloadAttachment(item)">
              <download-icon></download-icon>
            </router-link>
          </template>
          <template v-if="approved === true">
            approved by {{ item.managerName }}
          </template>
        </div>
        <div class="thirdline">
          <span class="label" v-if="item.paymentType === 'CorporateCreditCard'">
            Corporate Credit Card *{{ item.ccLast4digits }}
          </span>
          <span class="label" v-if="item.paymentType === 'FuelCard'">
            Fuel Card *{{ item.ccLast4digits }}
          </span>
          <span class="label" v-if="item.paymentType === 'FuelOnAccount'">
            Fuel on Account for unit {{ item.unitNumber }}
          </span>
          <span v-if="item.rejected" style="color: red">
            Rejected: {{ item.rejectionReason }}
          </span>
        </div>
      </div>
      <div class="rowactionsbox">
        <!-- The template for users -->
        <template v-if="approved === undefined">
          <template v-if="item.submitted === false">
            <router-link
              v-if="!item.attachment"
              :to="{ name: 'Expenses' }"
              v-on:click.native="copyEntry(item, collectionObject)"
              title="copy to tomorrow"
            >
              <copy-icon></copy-icon>
            </router-link>
            <router-link to="#" v-on:click.native="del(item, collectionObject)">
              <x-circle-icon></x-circle-icon>
            </router-link>
            <router-link :to="[parentPath, item.id, 'edit'].join('/')">
              <edit-icon></edit-icon>
            </router-link>
            <router-link
              v-bind:to="{ name: 'Expenses' }"
              v-on:click.native="submitExpense(item.id)"
            >
              <send-icon></send-icon>
            </router-link>
          </template>

          <template v-if="item.submitted === true && item.approved === false">
            <router-link
              v-bind:to="{ name: 'Expenses' }"
              v-on:click.native="recallExpense(item.id)"
            >
              <rewind-icon></rewind-icon>
            </router-link>
            <span class="label">submitted</span>
          </template>

          <template v-if="item.submitted === true && item.approved === true">
            <span v-if="item.committed === false" class="label">
              approved
            </span>
            <span v-else class="label">committed</span>
          </template>
        </template>

        <!-- The template for "pending" -->
        <template v-if="approved === false">
          <template v-if="!item.approved && !item.rejected">
            <router-link
              v-bind:to="{ name: 'Expenses Pending' }"
              v-on:click.native="approveExpense(item.id)"
            >
              <check-circle-icon></check-circle-icon>
            </router-link>
            <router-link
              v-if="!item.approved && !item.rejected"
              v-bind:to="{ name: 'Expenses Pending' }"
              v-on:click.native="$refs.rejectModal.openModal(item.id)"
            >
              <x-circle-icon></x-circle-icon>
            </router-link>
          </template>
          <template v-if="item.rejected">
            <span class="label">rejected</span>
          </template>
        </template>

        <!-- The template for "approved" -->
        <template v-if="approved === true">
          <template v-if="!item.committed">
            <router-link
              v-bind:to="{ name: 'Expenses Pending' }"
              v-on:click.native="$refs.rejectModal.openModal(item.id)"
            >
              <x-circle-icon></x-circle-icon>
            </router-link>
          </template>
          <template v-if="item.committed">
            <span class="label">committed</span>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Modal from "./RejectModal.vue";
import Vue from "vue";
import firebase from "../firebase";
import mixins from "./mixins";
import { format } from "date-fns";
import {
  EditIcon,
  CopyIcon,
  DownloadIcon,
  SendIcon,
  RewindIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "vue-feather-icons";
import store from "../store";
const db = firebase.firestore();

export default Vue.extend({
  mixins: [mixins],
  props: ["approved", "collection"],
  components: {
    Modal,
    EditIcon,
    CopyIcon,
    SendIcon,
    DownloadIcon,
    RewindIcon,
    CheckCircleIcon,
    XCircleIcon,
  },
  filters: {
    shortDate(date: Date) {
      return format(date, "MMM dd");
    },
  },
  data() {
    return {
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      items: [],
    };
  },
  methods: {
    commitItem(
      item: firebase.firestore.DocumentData,
      collection: firebase.firestore.CollectionReference
    ) {
      if (collection === null) {
        throw "There is no valid collection object";
      }
      collection
        .doc(item.id)
        .update({
          committed: true,
          commitTime: firebase.firestore.FieldValue.serverTimestamp(),
          commitUid: store.state.user?.uid,
          commitName: store.state.user?.displayName,
        })
        .catch((err) => {
          alert(`Error committing item: ${err}`);
        });
    },
    updateItems() {
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }
      const uid = store.state.user?.uid;
      if (uid === undefined) {
        throw "There is no valid uid";
      }
      if (typeof this.approved === "boolean") {
        // approved prop is defined, show pending or approved TimeSheets
        // belonging to users that this user manages
        this.$bind(
          "items",
          this.collectionObject
            .where("managerUid", "==", uid)
            .where("approved", "==", this.approved)
            .where("submitted", "==", true)
            .orderBy("date", "desc")
        ).catch((error) => {
          alert(`Can't load Expenses: ${error.message}`);
        });
      } else {
        // approved prop not defined, get user's own expenses
        this.$bind(
          "items",
          this.collectionObject.where("uid", "==", uid).orderBy("date", "desc")
        ).catch((error) => {
          alert(`Can't load Expenses: ${error.message}`);
        });
      }
    },
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.$watch("approved", this.updateItems, { immediate: true });
  },
});
</script>
