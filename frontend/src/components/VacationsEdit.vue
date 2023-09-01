<template>
  <form id="editor">
    <span class="field">
      <label for="description">Description</label>
      <input
        class="grow"
        type="text"
        name="description"
        v-model.trim="item.description"
        placeholder="Description"
      />
    </span>
    <span class="field">
      <label for="description">Availability</label>
      <input
        class="grow"
        type="text"
        name="availability"
        v-model.trim="item.availability"
        placeholder="Email and Teams messages 3pm-5pm weekdays EST"
      />
    </span>
    <span class="field">
      <label for="startDate">From</label>
      <datepicker
        name="startDate"
        placeholder="Start Date"
        :auto-apply="true"
        :min-date="dps.disabled.to"
        :max-date="dps.disabled.from"
        :highlight="dps.highlighted.dates"
        :enable-time-picker="false"
        :format="shortDateWithWeekday"
        week-start="0"
        hide-input-icon
        input-class-name="field"
        v-model="item.startDate"
      />
    </span>
    <span class="field">
      <label for="endDate">To</label>
      <datepicker
        name="endDate"
        placeholder="End Date"
        :auto-apply="true"
        :min-date="dps.disabled.to"
        :max-date="dps.disabled.from"
        :highlight="dps.highlighted.dates"
        :enable-time-picker="false"
        :format="shortDateWithWeekday"
        week-start="0"
        hide-input-icon
        input-class-name="field"
        v-model="item.endDate"
      />
    </span>
    <span class="field">
      <action-button v-if="validItem" type="save" @click.prevent="save(item)" />
      <action-button type="cancel" />
    </span>
  </form>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { useStateStore } from "../stores/state";
import Datepicker from "@vuepic/vue-datepicker";
import { addWeeks, subWeeks } from "date-fns";
import ActionButton from "./ActionButton.vue";
import { shortDateWithWeekday } from "./helpers";
import { firebaseApp } from "../firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { DocumentData } from "firebase/firestore";
export default defineComponent({
  setup() {
    const store = useStateStore();
    const { startTask, endTask } = store;
    return {
      startTask,
      endTask,
      user: store.user,
    };
  },
  components: { ActionButton, Datepicker },
  methods: {
    shortDateWithWeekday,
    async save(item: DocumentData) {
      const functions = getFunctions(firebaseApp);
      const createVacation = httpsCallable(functions, "createVacation");
      this.startTask({ id: "createVacation", message: "Saving Vacation" });
      await createVacation({
        start: item.startDate.getTime(),
        end: item.endDate.getTime(),
        description: item.description,
        availability: item.availability,
      })
        .then(() => {
          this.endTask("createVacation");
          // clear the form and redirect to the list
          this.item = { startDate: new Date() } as DocumentData;
          this.$router.push({ name: "Vacations List" });
        })
        .catch((error) => {
          this.endTask("createVacation");
          alert(`Error saving vacation: ${error.message}`);
        });
    },
  },
  computed: {
    validItem(): boolean {
      const isSequential =
        this.item.endDate?.getTime() > this.item.startDate?.getTime();
      return this.item.startDate && this.item.endDate && isSequential;
    },
  },
  props: ["id", "collectionName"],
  data() {
    return {
      item: { startDate: new Date() } as DocumentData,
      dps: {
        // date picker state
        disabled: {
          to: subWeeks(new Date(), 1),
          from: addWeeks(new Date(), 12),
        },
        highlighted: {
          dates: [new Date()],
        },
      },
    };
  },
});
</script>
