<template>
  <span class="field" v-show="job === undefined">
    <span class="grow">
      <div id="jobAutocomplete" />
    </span>
  </span>
  <span class="field" v-show="job !== undefined">
    <span class="grow">
      <action-button type="delete" @click.prevent="clearJob" />
      {{ job }} / {{ client }}:{{ jobDescription }}
    </span>
  </span>
  <span class="field" v-if="job !== undefined && categories !== null">
    <label for="category">Category</label>
    <select class="grow" name="category" v-model="category" @change="setCategory">
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
import { doc, getDoc, getFirestore } from "@firebase/firestore";
import { ref, onMounted } from "vue";
import { useStateStore } from "../stores/state";
import algoliasearch from "algoliasearch/lite";
import { autocomplete, getAlgoliaResults } from "@algolia/autocomplete-js";
import ActionButton from "./ActionButton.vue";

const emits = defineEmits(["set-job", "set-category","clear-job"]);
const store = useStateStore();
const db = getFirestore(firebaseApp);

const job = ref(undefined as string | undefined);
const client = ref(undefined as string | undefined);
const jobDescription = ref(undefined as string | undefined);
const categories = ref(null as string[] | null);
const category = ref(undefined as string | undefined);

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
  job.value = undefined;
  client.value = undefined;
  jobDescription.value = undefined;
  categories.value = null;
  category.value = undefined;
  emits("clear-job");
};

const setCategory = function() {
  emits("set-category", category.value);
};

const setupAlgolia = async function() {
  const profileSecrets = await getDoc(
    doc(db, "ProfileSecrets", store.user.uid)
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writeJobToItem = async (values: any) => {
    // save the job to the local state so it is reflected in the UI
    job.value = values.objectID;
    client.value = values.client;
    jobDescription.value = values.description;

    // load the job categories corresponding to the job if they exist
    await loadJobCategories(values.objectID);

    // emit the event to the parent component containing the job object
    emits("set-job", values);
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

onMounted(async () => {
  await setupAlgolia();
});

</script>