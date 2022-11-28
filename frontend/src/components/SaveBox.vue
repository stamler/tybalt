<template>
  <div>
    <span v-if="saveInProgress">
      <half-circle-spinner v-bind:size="25" color="#000000">
      </half-circle-spinner>
    </span>
    <span v-else>
      <button
        v-if="
          item.openingOV !== undefined &&
          item.openingOP !== undefined &&
          newOpeningDate !== undefined
        "
        type="button"
        v-on:click="save(item)"
      >
        Save
      </button>
    </span>
  </div>
</template>

<script lang="ts">
import Vue from "vue";
import firebase from "../firebase";
import { HalfCircleSpinner } from "epic-spinners";

export default Vue.extend({
  components: { HalfCircleSpinner },
  props: ["item", "newOpeningDate"],
  data() {
    return {
      saveInProgress: false,
    };
  },
  methods: {
    save(item: firebase.firestore.DocumentData) {
      const updateOpeningValues = firebase
        .functions()
        .httpsCallable("updateOpeningValues");

      // Perform the save of the individual item here,
      // using the this.newOpeningDate value from the top of the UI
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { openingOV, openingOP, ...rest } = item;

      this.saveInProgress = true;
      updateOpeningValues({
        uid: item.id,
        openingDateTimeOff: this.newOpeningDate?.getTime(),
        openingOV,
        openingOP,
      })
        .then(() => {
          this.saveInProgress = false;
        })
        .catch((error: unknown) => {
          this.saveInProgress = false;
          if (error instanceof Error) {
            alert(`Error saving item: ${error.message}`);
          } else {
            alert(`Error saving item: ${JSON.stringify(error)}`);
          }
        });
    },
  },
});
</script>
