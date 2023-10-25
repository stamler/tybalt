<template>
  <div v-if="invoice !== undefined">
    <h1>Invoice {{ invoiceNumberDisplay(invoice) }}</h1>
    <span v-if="invoice.replaced === true" class="attention">
      This invoice has been replaced
    </span>
    <p>
      <router-link :to="{ name: 'Job Details', params: { id: invoice.job } }">
        {{ invoice.job }}
      </router-link>
      — {{ shortDateWithWeekday(invoice.date.toDate()) }}
    </p>
    <div>
      <div>
        <table class="table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Description</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(lineItem, index) in invoice.lineItems" :key="index">
              <td>{{ lineItem.lineType }}</td>
              <td>{{ lineItem.description }}</td>
              <td>{{ lineItem.amount }}</td>
            </tr>
            <tr>
              <td></td>
              <td></td>
              <td>{{ lineItemsTotal }}</td>
            </tr>
          </tbody>
        </table>
        <router-link
          v-if="invoice.replaced === false"
          v-bind:to="{
            name: 'Revise Invoice',
            params: {
              invoiceId,
            },
          }"
        >
          Replace
        </router-link>
        <div v-if="allInvoices.length > 0">
          <h2>All Versions</h2>
          <ul>
            <li v-for="inv in allInvoices" :key="inv.id">
              <router-link
                :to="{
                  name: 'Invoice Details',
                  params: { invoiceId: inv.id },
                }"
              >
                {{ invoiceNumberDisplay(inv) }}
              </router-link>
              &nbsp;<span v-if="inv.replaced === false" class="label">
                active
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { InvoiceLineObject } from "./types";
import { shortDateWithWeekday, invoiceNumberDisplay } from "./helpers";
import { useStateStore } from "../stores/state";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  doc,
  collection,
  query,
  where,
  getDoc,
  DocumentData,
} from "firebase/firestore";
const db = getFirestore(firebaseApp);

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
  data() {
    return {
      invoice: undefined as DocumentData | undefined,
      allInvoices: [],
    };
  },
  created() {
    this.setData();
  },
  watch: {
    invoiceId: {
      immediate: true,
      handler() {
        this.setData();
      },
    },
  },
  props: ["invoiceId"],
  computed: {
    lineItemsTotal() {
      if (this.invoice === undefined) return 0;
      return this.invoice.lineItems.reduce(
        (total: number, lineItem: InvoiceLineObject) => total + lineItem.amount,
        0
      );
    },
  },
  methods: {
    invoiceNumberDisplay,
    shortDateWithWeekday,
    async setData() {
      // get the number and job number of the invoice
      const result = await getDoc(doc(db, "Invoices", this.invoiceId));
      this.invoice = result.data();
      // get all invoices with the number for the job
      this.$firestoreBind(
        "allInvoices",
        query(
          collection(db, "Invoices"),
          where("job", "==", this.invoice?.job),
          where("number", "==", this.invoice?.number)
        )
      );
    },
  },
});
</script>
