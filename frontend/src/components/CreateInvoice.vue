<template>
  <form id="editor">
    <h1>{{ revising ? "Revise" : "Create" }} Invoice</h1>
    <span class="field">
      <label for="number">Invoice Number</label>
      <input
        v-if="!revising"
        class="grow"
        type="text"
        name="number"
        v-model="invoiceNumber"
      />
      <span v-else>{{ invoiceNumber }}</span>
    </span>
    <span class="field">
      <label for="billingNumber">Billing Number</label>
      <input
        v-if="!revising"
        class="grow"
        type="number"
        name="billingNumber"
        v-model="billingNumber"
      />
      <span v-else>{{ billingNumber }}</span>
    </span>
    <span class="field">
      <label for="revisionNumber">Revision Number</label>
      <input
        v-if="revising"
        class="grow"
        type="number"
        name="revisionNumber"
        v-model="revisionNumber"
      />
    </span>
    <datepicker
      v-if="!revising"
      name="datepicker"
      placeholder="Date"
      :auto-apply="true"
      :min-date="dps.disabled.to"
      :max-date="dps.disabled.from"
      :highlight="dps.highlight"
      :enable-time-picker="false"
      :format="shortDateWithWeekday"
      hide-input-icon
      input-class-name="field"
      week-start="0"
      v-model="date"
    />
    <span v-else>{{ shortDateWithYear(date) }}</span>

    <h2>Line Items</h2>
    <div>
      <div>
        <table class="table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Description</th>
              <th>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(lineItem, index) in lineItems" :key="index">
              <td>
                <select name="type" v-model="lineItem.lineType">
                  <option
                    v-for="t in ALLOWED_INVOICE_LINE_TYPES"
                    :value="t"
                    v-bind:key="t"
                  >
                    {{ t }}
                  </option>
                </select>
              </td>
              <td>
                <select
                  v-if="lineItem.lineType === 'division'"
                  name="description"
                  v-model="lineItem.description"
                >
                  <option
                    v-for="division in divisions"
                    :value="division.id"
                    v-bind:key="division.id"
                  >
                    {{ division.name }} ({{ division.id }})
                  </option>
                </select>
                <input v-else type="text" v-model="lineItem.description" />
              </td>
              <td><input type="number" v-model="lineItem.amount" /></td>
              <td>
                <button @click.prevent="removeLineItem(index)">Remove</button>
              </td>
            </tr>
            <!-- The total row -->
            <tr>
              <td></td>
              <td></td>
              <td>
                {{
                  lineItems.reduce(
                    (total, lineItem) => total + lineItem.amount,
                    0
                  )
                }}
              </td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <button @click.prevent="addLineItem">Add Line Item</button>
      </div>
      <button @click.prevent="createInvoice">Create</button>
      <router-link :to="{ name: 'Job Details', params: { id: job } }">
        Cancel
      </router-link>
    </div>
  </form>
</template>

<script lang="ts">
// CreateInvoice operates in two modes:
// 1. When the invoiceId prop is undefined, we are creating a new invoice for a
//    job. In this mode, the invoice number is editable. All of the fields
//    except revisionNumber are visible. revisionNumber is automatically set to
//    0.
// 2. When the invoiceId prop is set, we are creating a revision of an existing
//    invoice. In this mode, the invoice number is not editable. The invoice
//    number is set to the previous invoice's number and the field for editing
//    revisionNumber is visible.

import { defineComponent } from "vue";
import { useCollection } from "vuefire";
import Datepicker from "@vuepic/vue-datepicker";
import { addWeeks, subWeeks } from "date-fns";
import { InvoiceLineObject, ALLOWED_INVOICE_LINE_TYPES } from "./types";
import { shortDateWithWeekday, shortDateWithYear } from "./helpers";
import { useStateStore } from "../stores/state";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  doc,
  getDoc,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp);

export default defineComponent({
  name: "CreateInvoice",
  setup() {
    const store = useStateStore();
    const { startTask, endTask } = store;
    return {
      startTask,
      endTask,
    };
  },
  components: {
    Datepicker,
  },
  props: {
    job: String,
    invoiceId: String,
  },
  watch: {
    invoiceId: {
      immediate: true,
      handler(invoiceId) {
        this.setItem(invoiceId);
      },
    },
  },
  data() {
    return {
      dps: {
        // date picker state
        disabled: {
          to: subWeeks(new Date(), 12),
          from: addWeeks(new Date(), 4),
        },
        highlight: {
          dates: [new Date()],
        },
      },
      date: new Date(),
      invoiceNumber: "",
      billingNumber: 1,
      revisionNumber: 0,
      lineItems: [
        {
          lineType: "division",
          description: "",
          amount: 0,
        },
      ] as InvoiceLineObject[],
      ALLOWED_INVOICE_LINE_TYPES,
      divisions: useCollection(
        query(collection(db, "Divisions"), orderBy("name", "asc"))
      ),
    };
  },
  computed: {
    revising() {
      return this.invoiceId !== undefined;
    },
    lineItemsTotal() {
      return this.lineItems.reduce(
        (total: number, lineItem: InvoiceLineObject) => total + lineItem.amount,
        0
      );
    },
  },
  methods: {
    async setItem(id: string) {
      if (id === undefined) return;
      // load the data from the invoice to be replaced
      const previousInvoiceData = (
        await getDoc(doc(db, "Invoices", id))
      ).data();
      if (previousInvoiceData === undefined) {
        alert(`Error loading invoice ${id}`);
        return;
      }
      this.invoiceNumber = previousInvoiceData.number;
      this.date = previousInvoiceData.date.toDate();
      this.lineItems = previousInvoiceData.lineItems;
    },
    shortDateWithWeekday,
    shortDateWithYear,
    addLineItem() {
      this.lineItems.push({
        lineType: "division",
        description: "",
        amount: 0,
      });
    },
    removeLineItem(index: number) {
      this.lineItems.splice(index, 1);
    },
    createInvoice() {
      const createInvoice = httpsCallable(functions, "createInvoice");
      this.startTask({
        id: "createInvoice",
        message: "creating...",
      });
      const newInvoice = {
        job: this.job,
        number: this.invoiceNumber,
        billingNumber: this.billingNumber,
        revisionNumber: this.revisionNumber,
        date: this.date.getTime(),
        lineItems: this.lineItems,
      };
      createInvoice(newInvoice)
        .then(() => {
          this.endTask("createInvoice");
          this.$router.push({ name: "Job Details", params: { id: this.job } });
        })
        .catch((error: unknown) => {
          this.endTask("createInvoice");
          if (error instanceof Error) {
            alert(`Error creating invoice: ${error.message}`);
          } else alert(`Error creating invoice: ${JSON.stringify(error)}`);
        });
    },
  },
});
</script>
