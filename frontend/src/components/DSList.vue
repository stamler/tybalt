<script setup lang="ts">
/**
 * This component will be used to display all lists in the app. It will be
 * provided with several props:
 * - query: A Firestore Query object that will be used to fetch the data. This
 *   will be bound using vuefire to the items array in the component's data.
 * - search: a boolean indicating whether the list should be searchable. If
 *   true, a search box will be displayed at the top of the list.
 * - rowAltVisualFn: a function that takes an item and returns a boolean. This
 *   will be applied to each item in the list and if it returns true, the item's
 *   row will be given an alternate colour scheme.
 * - processorFn: an optional function that processes the items list to filter
 *   it or otherwise manipulate values. This disables the search functionality.
 * - searchFields: an array of strings indicating which fields should be
 *   searched when the user types in the search box. If not provided, all fields
 *   will be searched. (TODO: implement this)
 *
 * This component has multiple slots, named as follows:
 * - anchor: the leftmost column of the list. This is usually a link to the
 *   item's details page.
 * - headline: the main text of the list item. This is usually the item's name.
 * - byline: the secondary text of the list item.
 * - line1: the first line of the details box.
 * - line2: the second line of the details box.
 * - line3: the third line of the details box.
 * - actions: the rightmost column of the list. This will contain buttons for
 *   the various actions that can be performed on the item.
 *
 * Each slot is furnished the following props:
 * - item: the item to be displayed
 * - index: the index of the item in the list (TODO: implement this)
 **/

import { Query, DocumentData } from "@firebase/firestore";
import { useCollection } from "vuefire";
import type { PropType } from "vue";
import { ref, computed, toRaw, watch } from "vue";
import { searchString } from "./helpers";

const props = defineProps({
  query: {
    // https://vuejs.org/api/utility-types.html#proptype-t
    type: Object as PropType<Query>,
    required: true,
  },
  search: {
    type: Boolean,
    default: false,
  },
  processorFn: {
    type: Function as PropType<(items: DocumentData[]) => DocumentData[]>,
  },
  rowAltVisualFn: {
    type: Function as PropType<(item: DocumentData) => boolean>,
    default: () => false,
  },
});

const searchTerm = ref("");
// Why are we using a computed here in the call to useCollection?
// See here <https://github.com/vuejs/vuefire/discussions/1436>
// TODO: check internally if query is null and return ref([]) if so
const items = useCollection(computed(() => props.query));
const processedItems = computed(() => {
  if (props.processorFn) {
    return props.processorFn(items.value.slice().map((p) => toRaw(p)));
  }
  return items.value
    .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
    .filter(
      (p: DocumentData) =>
        searchString(p).indexOf(searchTerm.value.toLowerCase()) >= 0
    )
    .map((p: DocumentData) => {
      // Without toRaw, the returned objects are missing the id property. This
      // is because vuefire wraps the objects in a proxy, and that proxy is
      // missing the id property for some reason. toRaw unwraps the proxy.
      // Further work is likely needed to understand why this is happening and
      // perhaps fix it in a more elegant way. Because the list is read-only,
      // this is not a problem for now. However, if the list becomes editable,
      // this will need to be fixed because reactivity will be lost when using
      // toRaw?
      return toRaw(p);
    });
});

// reset searchTerm when the query changes
watch(
  () => props.query,
  () => {
    searchTerm.value = "";
  },
  { immediate: true }
);

// report an error if search is true and processorFn is defined
watch(
  () => props.processorFn,
  () => {
    if (props.search === true && props.processorFn !== undefined) {
      alert(
        "DSList: search is not supported when using a processorFn. Contact the developer."
      );
    }
  },
  { immediate: true }
);
</script>

<template>
  <div id="list">
    <div id="listbar" v-if="search && processorFn === undefined">
      <input
        id="searchbox"
        type="textbox"
        placeholder="search..."
        v-model="searchTerm"
      />
      <span>{{ processedItems.length }} items</span>
    </div>
    <div
      class="listentry"
      v-bind:class="{ listItemAltVisual: rowAltVisualFn(item) }"
      v-for="item in processedItems"
      v-bind:key="item.id"
    >
      <div class="anchorbox"><slot name="anchor" v-bind="item" /></div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">
            <slot name="headline" v-bind="item" />
          </div>
          <div class="byline"><slot name="byline" v-bind="item" /></div>
        </div>
        <div class="firstline">
          <slot name="line1" v-bind="item" />
        </div>
        <div class="secondline"><slot name="line2" v-bind="item" /></div>
        <div class="thirdline"><slot name="line3" v-bind="item" /></div>
      </div>
      <div class="rowactionsbox"><slot name="actions" v-bind="item" /></div>
    </div>
  </div>
</template>
