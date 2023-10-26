<template>
  <div>
    <span v-if="saveInProgress">
      <div class="lds-ring">
        <div></div>
      </div>
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
import { defineComponent } from "vue";
import { firebaseApp } from "../firebase";
import { DocumentData } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

const functions = getFunctions(firebaseApp);
export default defineComponent({
  props: ["item", "newOpeningDate"],
  data() {
    return {
      saveInProgress: false,
    };
  },
  methods: {
    save(item: DocumentData) {
      const updateOpeningValues = httpsCallable(
        functions,
        "updateOpeningValues"
      );

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
<style scoped>
@import "./lds-ring.css";
</style>
