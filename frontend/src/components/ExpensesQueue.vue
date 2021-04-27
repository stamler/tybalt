<template>
  <div id="list">
    <modal ref="rejectModal" collection="Expenses" />
    <span class="listheader" v-if="approved.length > 0">Approved</span>
    <div class="listentry" v-for="item in approved" v-bind:key="item.id">
      <div class="anchorbox">
        {{ item.date.toDate() | shortDate }}
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">
            {{ item.displayName }}
          </div>
          <div class="byline" v-if="item.paymentType === 'Mileage'">
            {{ item.distance }} km
          </div>
          <div class="byline" v-else>
            ${{ item.total }}
            <span v-if="item.po">/PO:{{ item.po }}</span>
            <span v-if="item.vendorName">/vendor: {{ item.vendorName }}</span>
          </div>
        </div>
        <div class="firstline">
          {{ item.description }}
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
          approved by {{ item.managerName }}
        </div>
        <div class="thirdline">
          <span class="label" v-if="item.paymentType === 'CorporateCreditCard'">
            Corporate Credit Card *{{ item.ccLast4digits }}
          </span>
          <span class="label" v-if="item.paymentType === 'FuelCard'">
            Fuel Card *{{ item.ccLast4digits }}
          </span>
          <span v-if="item.rejected" style="color: red">
            Rejected: {{ item.rejectionReason }}
          </span>
        </div>
      </div>
      <div class="rowactionsbox">
        <router-link
          v-bind:to="{ name: 'Expenses Commit Queue' }"
          v-on:click.native="$refs.rejectModal.openModal(item.id)"
        >
          <x-circle-icon></x-circle-icon>
        </router-link>
        <router-link
          v-bind:to="{ name: 'Expenses Commit Queue' }"
          v-on:click.native="commitItem(item, collectionObject)"
        >
          <lock-icon></lock-icon>
        </router-link>
      </div>
    </div>
    <span class="listheader" v-if="submitted.length > 0">
      Awaiting manager approval
    </span>
    <div class="listentry" v-for="item in submitted" v-bind:key="item.id">
      <div class="anchorbox">
        {{ item.date.toDate() | shortDate }}
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">
            {{ item.displayName }}
          </div>
          <div class="byline" v-if="item.paymentType === 'Mileage'">
            {{ item.distance }} km
          </div>
          <div class="byline" v-else>
            ${{ item.total }}
            <span v-if="item.po">/PO:{{ item.po }}</span>
            <span v-if="item.vendorName">/vendor: {{ item.vendorName }}</span>
          </div>
        </div>
        <div class="firstline">
          {{ item.description }}
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
          /manager: {{ item.managerName }}
        </div>
        <div class="thirdline">
          <span class="label" v-if="item.paymentType === 'CorporateCreditCard'">
            Corporate Credit Card *{{ item.ccLast4digits }}
          </span>
          <span class="label" v-if="item.paymentType === 'FuelCard'">
            Fuel Card *{{ item.ccLast4digits }}
          </span>
          <span v-if="item.rejected" style="color: red">
            Rejected: {{ item.rejectionReason }}
          </span>
        </div>
      </div>
      <div class="rowactionsbox">
        <router-link
          v-bind:to="{ name: 'Expenses Commit Queue' }"
          v-on:click.native="$refs.rejectModal.openModal(item.id)"
        >
          <x-circle-icon></x-circle-icon>
        </router-link>
        <router-link
          v-bind:to="{ name: 'Expenses Commit Queue' }"
          v-on:click.native="commitItem(item, collectionObject)"
        >
          <lock-icon></lock-icon>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from "vue";
import Modal from "./Modal.vue";
import firebase from "../firebase";
import mixins from "./mixins";
import { format } from "date-fns";
import { LockIcon, DownloadIcon, XCircleIcon } from "vue-feather-icons";
import store from "../store";
const db = firebase.firestore();

export default Vue.extend({
  mixins: [mixins],
  props: ["collection"],
  components: {
    Modal,
    LockIcon,
    DownloadIcon,
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
      approved: [],
      submitted: [],
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
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    if (this.collectionObject === null) {
      throw "There is no valid collection object";
    }
    const uid = store.state.user?.uid;
    if (uid === undefined) {
      throw "There is no valid uid";
    }

    // populate approved items awaiting commit
    this.$bind(
      "approved",
      this.collectionObject
        .where("approved", "==", true)
        .where("committed", "==", false)
        .orderBy("date", "desc")
    ).catch((error) => {
      alert(`Can't load Expenses: ${error.message}`);
    });

    // populate submitted items awaiting commit
    this.$bind(
      "submitted",
      this.collectionObject
        .where("submitted", "==", true)
        .where("approved", "==", false)
        .orderBy("date", "desc")
    ).catch((error) => {
      alert(`Can't load Expenses: ${error.message}`);
    });
  },
});
</script>
