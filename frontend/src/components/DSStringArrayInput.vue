<!-- 
  This component is used to edit an array of strings. It has props for the array
  and the label. It emits an event when the array is changed so that the parent
  component can perform the necessary actions.
-->
<template>
  <span class="field">
    <label>{{ label }}</label>
    <span class="label" v-for="(item, index) in arrg" v-bind:key="index">
      {{ item }}
      <!-- emit an event to the parent component to delete the item -->
      <button @click.prevent="$emit('delete-element', index)">
        <Icon icon="feather:x" width="18px" />
      </button>
    </span>
    <span class="grow">
      <div id="stringArrayTextInput" />
    </span>
  </span>
</template>

<script lang="ts">
import { Icon } from "@iconify/vue";
import algoliasearch from "algoliasearch/lite";
import { autocomplete, getAlgoliaResults } from "@algolia/autocomplete-js";
import { defineComponent } from "vue";
import { getDoc } from "firebase/firestore";
export default defineComponent({
  props: [
    "profileDoc",
    "arrg",
    "label",
    "placeholder",
    "indexName",
    "templateFunction",
  ],
  components: {
    Icon,
  },
  data() {
    return {
      newElement: "",
    };
  },
  created() {
    this.setupAlgolia();
  },
  methods: {
    async setupAlgolia() {
      // setup algolia autocomplete
      const profileSecrets = await getDoc(this.profileDoc);
      const searchClient = algoliasearch(
        "F7IPMZB3IW",
        profileSecrets.get("algoliaSearchKey")
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const add = (item: Record<string, any>) => {
        this.$emit("add-element", item);
      };
      const idx_n = () => {
        return this.indexName;
      };
      const templateFn = this.templateFunction;
      autocomplete({
        container: "#stringArrayTextInput",
        placeholder: this.placeholder,
        getSources() {
          return [
            {
              sourceId: "unique-identifier-for-this-source",
              onSelect({ item, state }) {
                // clear the input field
                state.query = "";
                add(item);
              },
              templates: {
                item({ item }) {
                  return templateFn(item);
                },
              },
              getItems({ query }) {
                return getAlgoliaResults({
                  searchClient,
                  queries: [
                    {
                      indexName: idx_n(),
                      query,
                    },
                  ],
                });
              },
            },
          ];
        },
      });
    },
  },
});
</script>
<style scoped>
.aa-InputWrapper {
  min-width: 12em;
}
button {
  color: var(--button-link-color);
  background: none;
  border: none;
  border-radius: 0;
  text-decoration: none;
  font-size: 1em;
  font-weight: bold;
  font-family: inherit;
  cursor: pointer;
  margin: inherit;
  margin-left: 0;
  padding: 0;
}
button:hover {
  transition: filter 0.05s ease-in;
  filter: drop-shadow(2px 2px 1px rgb(0 0 0 / 0.3));
}

button:active {
  filter: brightness(0.7) drop-shadow(1px 1px 1px rgb(0 0 0 / 0.3));
}
</style>
