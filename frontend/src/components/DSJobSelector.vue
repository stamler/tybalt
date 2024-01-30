<template>
  <span class="field" v-show="item.job === undefined">
    <span class="grow">
      <div id="jobAutocomplete" />
    </span>
  </span>
  <span class="field" v-show="item.job !== undefined">
    <span class="grow">
      <action-button type="delete" @click.prevent="clearJob" />
      {{ item.job }} / {{ item.client }}:{{ item.jobDescription }}
    </span>
  </span>
  <!-- find another way to determine whether to show that that isn't categories !== null -->
  <span class="field" v-if="item.job !== undefined && categories !== null">
    <label for="category">Category</label>
    <select class="grow" name="category" v-model="item.category">
      <option disabled selected value="">-- choose category --</option>
      <option v-for="c in categories" :value="c" v-bind:key="c">
        {{ c }}
      </option>
    </select>
  </span>
</template>

<script setup lang="ts">
/**
 * ·𐑛𐑰𐑯 ·𐑕𐑑𐑨𐑥𐑤𐑼 2024-01-09
 * This component will be used to select a job and any corresponding categories
 * in the app using Algolia autocomplete. It will emit two events:
 * - set-job: when a job is selected, this event will be emitted with an object
 *   containing the job's id and name as well as client description.
 * - set-category: when a category is selected, this event will be emitted
 *   with a string for the selected category.
 * - clear-job: when the job is cleared, this event will be emitted.
 **/

import { firebaseApp } from "../firebase";
import { doc, getDoc, getFirestore, DocumentData } from "@firebase/firestore";
import { ref, onMounted, watch } from "vue";
import { useStateStore } from "../stores/state";
import algoliasearch from "algoliasearch/lite";
import { autocomplete, getAlgoliaResults } from "@algolia/autocomplete-js";
import ActionButton from "./ActionButton.vue";

// TODO: implement two-way binding for the job and category so that the parent
// component can set the job and category from the outside. This will also
// obviate the need for all emits but especially the clear-job emit since this
// component can just set the job and category to undefined when the clear button
// is clicked.
const emits = defineEmits(["change-job"]);
const store = useStateStore();
const db = getFirestore(firebaseApp);

const categories = ref(null as string[] | null);
const item = defineModel<DocumentData>({required: true});

const loadJobCategories = async function(jobId: string | undefined) {
  if (jobId === undefined) {
    categories.value = null;
    return;
  }
  // get the job document from firestore and if the job has a categories
  // list set the jobCategories list
  const jobDoc = await getDoc(doc(db, "Jobs", jobId));
  if (jobDoc.exists()) {
    const categoriesProp = jobDoc.get("categories");
    // if categories is an array set the flag to true
    if (Array.isArray(categoriesProp)) {
      categories.value = categoriesProp;
    } else {
      categories.value = null;
    }
  }
};

const clearJob = function() {
  delete item.value.job;
  delete item.value.client;
  delete item.value.jobDescription;
  delete item.value.category;
  categories.value = null;
  emits("change-job");
};

const setupAlgolia = async function() {
  const profileSecrets = await getDoc(
    doc(db, "ProfileSecrets", store.user.uid)
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writeJobToItem = async (values: any) => {
    // save the job to the local state so it is reflected in the UI
    item.value.job = values.objectID;
    item.value.client = values.client;
    item.value.jobDescription = values.description;

    // alert the parent component to update the job-related properties (such as
    // manager for PurchaseOrderRequest documents), including the payload from
    // the index that the parent can use to get values from the index.
    emits("change-job", values);
  };
  const searchClient = algoliasearch(
    "F7IPMZB3IW",
    profileSecrets.get("algoliaSearchKey")
  );
  autocomplete({
    container: "#jobAutocomplete",
    placeholder: "search jobs...",
    getSources() {
      return [
        {
          sourceId: "jobs",
          onSelect({ item }) {
            writeJobToItem(item);
          },
          templates: {
            item({ item }) {
              return `${item.objectID} - ${item.client}:${item.description}`;
            },
          },
          getItems({ query }) {
            return getAlgoliaResults({
              searchClient,
              queries: [
                {
                  indexName: "tybalt_jobs",
                  query,
                  // params: {
                  //   hitsPerPage: 7,
                  // },
                },
              ],
            });
          },
        },
      ];
    },
  });
};

watch(
  () => item.value.job,
  async (newVal, oldVal) => {
    // if newJob is not undefined, load the job categories
    if (item.value.job !== undefined) {
      await loadJobCategories(item.value.job);
    }
  }
);
onMounted(async () => {
  await setupAlgolia();
});
</script>
<style lang="scss">
  @import "./algolia-autocomplete-classic-fork.scss";
</style>