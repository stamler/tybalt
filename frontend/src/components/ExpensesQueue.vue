<template>
  <div id="list">
    <modal ref="rejectModal" collection="Expenses" />
    <span class="listheader" v-if="approved.length > 0">Approved</span>
    <div class="listentry" v-for="item in approved" v-bind:key="item.id">
      <div class="anchorbox">
        {{ shortDate(item.date.toDate()) }}
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">
            {{ item.displayName }}
          </div>
          <div class="byline">
            <template v-if="item.paymentType === 'Mileage'">
              {{ item.distance }} km
            </template>
            <template
              v-else-if="['Meals', 'Allowance'].includes(item.paymentType)"
            >
              {{ item.breakfast ? "Breakfast" : "" }}
              {{ item.lunch ? "Lunch" : "" }}
              {{ item.dinner ? "Dinner" : "" }}
              {{ item.lodging ? "Personal Accommodation" : "" }}
            </template>
            <template v-else>
              ${{ item.total }}
              <span v-if="item.po">/PO:{{ item.po }}</span>
              <span v-if="item.vendorName">/vendor: {{ item.vendorName }}</span>
            </template>
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
            <action-button type="download" @click="downloadAttachment(item)" />
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
          <span class="label" v-if="item.paymentType === 'FuelOnAccount'">
            Fuel on Account for unit {{ item.unitNumber }}
          </span>

          <span v-if="item.rejected" style="color: red">
            Rejected: {{ item.rejectionReason }}
          </span>
        </div>
      </div>
      <div class="rowactionsbox">
        <action-button
          type="delete"
          @click="$refs.rejectModal.openModal(item.id)"
        />
        <action-button
          type="lock"
          @click="commitItem(item, collectionObject)"
        />
      </div>
    </div>
    <span class="listheader" v-if="submitted.length > 0">
      Awaiting manager approval
    </span>
    <div class="listentry" v-for="item in submitted" v-bind:key="item.id">
      <div class="anchorbox">
        {{ shortDate(item.date.toDate()) }}
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">
            {{ item.displayName }}
          </div>
          <div class="byline">
            <template v-if="item.paymentType === 'Mileage'">
              {{ item.distance }} km
            </template>
            <template
              v-else-if="['Meals', 'Allowance'].includes(item.paymentType)"
            >
              {{ item.breakfast ? "Breakfast" : "" }}
              {{ item.lunch ? "Lunch" : "" }}
              {{ item.dinner ? "Dinner" : "" }}
              {{ item.lodging ? "Personal Accommodation" : "" }}
            </template>
            <template v-else>
              ${{ item.total }}
              <span v-if="item.po">/PO:{{ item.po }}</span>
              <span v-if="item.vendorName">/vendor: {{ item.vendorName }}</span>
            </template>
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
            <action-button type="download" @click="downloadAttachment(item)" />
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
          <span class="label" v-if="item.paymentType === 'FuelOnAccount'">
            Fuel on Account for unit {{ item.unitNumber }}
          </span>
          <span v-if="item.rejected" style="color: red">
            Rejected: {{ item.rejectionReason }}
          </span>
        </div>
      </div>
      <div class="rowactionsbox">
        <action-button
          type="delete"
          @click="$refs.rejectModal.openModal(item.id)"
        />
        <action-button
          type="lock"
          @click="commitItem(item, collectionObject)"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { downloadAttachment, shortDate } from "./helpers";
import Modal from "./RejectModal.vue";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  CollectionReference,
  DocumentData,
  collection,
  query,
  where,
  orderBy,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import ActionButton from "./ActionButton.vue";
import { useStateStore } from "../stores/state";
const db = getFirestore(firebaseApp);

export default defineComponent({
  setup() {
    const store = useStateStore();
    return { user: store.user };
  },
  props: ["collectionName"],
  components: {
    ActionButton,
    Modal,
  },
  data() {
    return {
      parentPath: "",
      collectionObject: null as CollectionReference | null,
      approved: [],
      submitted: [],
    };
  },
  methods: {
    shortDate,
    downloadAttachment,
    commitItem(item: DocumentData, collection: CollectionReference) {
      if (collection === null) {
        throw "There is no valid collection object";
      }
      updateDoc(doc(collection, item.id), {
        committed: true,
        commitTime: serverTimestamp(),
        commitUid: this.user.uid,
        commitName: this.user.displayName,
        exported: false,
      }).catch((error: unknown) => {
        if (error instanceof Error) {
          alert(`Error committing item: ${error.message}`);
        } else alert(`Error committing item: ${JSON.stringify(error)}`);
      });
    },
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
    this.collectionObject = collection(db, this.collectionName);
    if (this.collectionObject === null) {
      throw "There is no valid collection object";
    }
    const uid = this.user.uid;
    if (uid === undefined) {
      throw "There is no valid uid";
    }

    // populate approved items awaiting commit
    this.$firestoreBind(
      "approved",
      query(
        this.collectionObject,
        where("approved", "==", true),
        where("committed", "==", false),
        orderBy("date", "desc")
      )
    ).catch((error: unknown) => {
      if (error instanceof Error) {
        alert(`Can't load Expenses: ${error.message}`);
      } else alert(`Can't load Expenses: ${JSON.stringify(error)}`);
    });

    // populate submitted items awaiting commit
    this.$firestoreBind(
      "submitted",
      query(
        this.collectionObject,
        where("submitted", "==", true),
        where("approved", "==", false),
        orderBy("date", "desc")
      )
    ).catch((error: unknown) => {
      if (error instanceof Error) {
        alert(`Can't load Expenses: ${error.message}`);
      } else alert(`Can't load Expenses: ${JSON.stringify(error)}`);
    });
  },
});
</script>
