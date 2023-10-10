<template>
  <form id="editor" v-if="invoice !== undefined">
    <h1>Invoice {{ invoiceNumberDisplay(invoice) }}</h1>
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
      </div>
      <router-link
        v-bind:to="{
          name: 'Revise Invoice',
          params: {
            invoiceId,
          },
        }"
      >
        Replace
      </router-link>
      <!-- TODO: next & previous buttons -->
    </div>
  </form>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { InvoiceLineObject } from "./types";
import { shortDateWithWeekday, invoiceNumberDisplay } from "./helpers";
import { useStateStore } from "../stores/state";
import { firebaseApp } from "../firebase";
import { getFirestore, doc } from "firebase/firestore";
import { useDocument } from "vuefire";

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
      invoice: useDocument(doc(db, "Invoices", this.invoiceId)),
    };
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
  },
});
</script>
