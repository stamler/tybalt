<template>
  <form id="editor">
    <span class="field">
      <label for="job">Project/Proposal #</label>
      <span v-if="editing">{{ id }}</span>
      <input class="grow" v-else type="text" name="job" v-model="item.id" />
    </span>
    <span class="field" v-show="item.manager !== undefined">
      <label for="legacyManager">Legacy Manager</label>
      {{ item.manager }}
    </span>
    <span class="field" v-show="managerUid === undefined">
      <label for="manager">Manager</label>
      <span class="grow">
        <div id="managerAutocomplete" />
      </span>
    </span>
    <span class="field" v-show="managerUid !== undefined">
      <label for="manager">Manager</label>
      <span class="grow">
        <action-button type="delete" @click.prevent="managerUid = undefined" />
        {{ item.managerDisplayName }}
      </span>
    </span>
    <span class="field" v-show="alternateManagerUid === undefined">
      <label for="manager">Alt. Manager</label>
      <span class="grow">
        <div id="alternateManagerAutocomplete" />
      </span>
    </span>
    <DSStringArrayInput
      :profileDoc="profileSecretsDoc"
      :arrg="item.divisions"
      :templateFunction="(item: any) => { return `${item.objectID} - ${item.name}` }"
      label="Divisions"
      placeholder="start typing..."
      indexName="tybalt_divisions"
      @add-element="addDivision"
      @delete-element="deleteDivision"
    />
    <span class="field">
      <label for="categories">Categories</label>
      <span
        class="label"
        v-for="(item, index) in item.categories"
        v-bind:key="index"
      >
        {{ item }}
        <!-- emit an event to the parent component to delete the item -->
        <button class="del_but" @click.prevent="deleteCategory(index)">
          <Icon icon="feather:x" width="18px" />
        </button>
      </span>
      <input
        class="grow"
        type="text"
        name="categoriesInput"
        v-model="categoriesInput"
        @input="updateCategoriesInput"
      />
    </span>
    <span class="field" v-show="alternateManagerUid !== undefined">
      <label for="manager">Alt. Manager</label>
      <span class="grow">
        <action-button
          type="delete"
          @click.prevent="alternateManagerUid = undefined"
        />
        {{ item.alternateManagerDisplayName }}
      </span>
    </span>

    <span class="field">
      <label for="client">Client</label>
      <input class="grow" type="text" name="client" v-model="item.client" />
    </span>
    <span class="field">
      <label for="jobOwner">Job Owner</label>
      <input class="grow" type="text" name="jobOwner" v-model="item.jobOwner" />
    </span>
    <span class="field">
      <label for="clientContact">Client Contact</label>
      <input
        class="grow"
        type="text"
        name="clientContact"
        v-model="item.clientContact"
      />
    </span>
    <span class="field" v-if="isProject">
      <label for="projectAwardDate">Project Award Date</label>
      <datepicker
        name="projectAwardDate"
        placeholder="Select..."
        :auto-apply="true"
        :enable-time-picker="false"
        :format="shortDateWithWeekday"
        hide-input-icon
        input-class-name="jobDateField"
        week-start="0"
        v-model="item.projectAwardDate"
      />
    </span>
    <span class="field" v-if="!isProject">
      <label for="proposalOpeningDate">Proposal Opening Date</label>
      <datepicker
        name="proposalOpeningDate"
        placeholder="Select..."
        :auto-apply="true"
        :enable-time-picker="false"
        :format="shortDateWithWeekday"
        hide-input-icon
        input-class-name="jobDateField"
        week-start="0"
        v-model="item.proposalOpeningDate"
      />
    </span>
    <span class="field" v-if="!isProject">
      <label for="proposalSubmissionDueDate">
        Proposal Submission Due Date
      </label>
      <datepicker
        name="proposalSubmissionDueDate"
        placeholder="Select..."
        :auto-apply="true"
        :enable-time-picker="false"
        :format="shortDateWithWeekday"
        hide-input-icon
        input-class-name="jobDateField"
        week-start="0"
        v-model="item.proposalSubmissionDueDate"
      />
    </span>
    <span class="field" v-if="isProject">
      <!-- Hide if id is proposal (starts with 'P') -->
      <!-- TODO: Restrict to existing proposals -->
      <label for="proposal">Proposal</label>
      <input class="grow" type="text" name="proposal" v-model="item.proposal" />
    </span>
    <span class="field">
      <label for="description">Description</label>
      <input class="grow" type="text" name="code" v-model="item.description" />
    </span>
    <span class="field">
      <label for="fnAgreement">FN Agreement</label>
      <input type="checkbox" id="fnAgreement" v-model="item.fnAgreement" />
    </span>
    <span class="field">
      <select class="grow" name="status" v-model="item.status">
        <option disabled selected value="">-- choose status --</option>
        <option value="Active">Active</option>
        <option value="Cancelled">Cancelled</option>
        <template v-if="editing">
          <option v-if="id.startsWith('P')" value="Not Awarded">
            Not Awarded
          </option>
          <option v-if="id.startsWith('P')" value="Awarded">Awarded</option>
          <option v-if="!id.startsWith('P')" value="Closed">Closed</option>
        </template>
        <template v-if="!editing && item.id">
          <option v-if="item.id.startsWith('P')" value="Not Awarded">
            Not Awarded
          </option>
          <option v-if="item.id.startsWith('P')" value="Awarded">
            Awarded
          </option>
          <option v-if="!item.id.startsWith('P')" value="Closed">Closed</option>
        </template>
      </select>
    </span>

    <span class="field">
      <button type="button" v-on:click="save()">Save</button>
      <button type="button" v-on:click="$router.push(parentPath)">
        Cancel
      </button>
    </span>
  </form>
</template>

<script lang="ts">
// interface Job {
//   id: string;
//   manager?: string;
//   managerDisplayName: string;
//   managerUid: string;
//   alternateManagerDisplayName: string;
//   alternateManagerUid: string;
//   client: string;
//   clientContact: string;
//   jobOwner: string;
//   proposal?: string;
//   description: string;
//   status: string;
//   divisions: string[];
// }

import { defineComponent } from "vue";
import { useCollection } from "vuefire";
import { firebaseApp } from "../firebase";
import _ from "lodash";
import { useStateStore } from "../stores/state";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  CollectionReference,
  DocumentSnapshot,
  DocumentData,
  DocumentReference,
  runTransaction,
} from "firebase/firestore";
import ActionButton from "./ActionButton.vue";
import { Icon } from "@iconify/vue";
import DSStringArrayInput from "./DSStringArrayInput.vue";
import algoliasearch from "algoliasearch/lite";
import { autocomplete, getAlgoliaResults } from "@algolia/autocomplete-js";
import Datepicker from "@vuepic/vue-datepicker";
import { shortDateWithWeekday } from "./helpers";

const db = getFirestore(firebaseApp);

export default defineComponent({
  setup() {
    // user doesn't need to be reactive so no refs wanted, just the user object,
    // so we don't use storeToRefs() to toRef()
    return { user: useStateStore().user };
  },
  props: ["id", "collectionName"],
  components: {
    ActionButton,
    Datepicker,
    DSStringArrayInput,
    Icon,
  },
  data() {
    return {
      categoriesInput: "",
      parentPath: "",
      collectionObject: null as CollectionReference | null,
      item: { status: "", divisions: [], fnAgreement: false } as DocumentData,
      managerUid: undefined as string | undefined,
      alternateManagerUid: undefined as string | undefined,
      divisions: useCollection(collection(db, "Divisions")),
      profileSecretsDoc: undefined as
        | DocumentReference<DocumentData>
        | undefined,
    };
  },
  computed: {
    editing: function (): boolean {
      return this.id !== undefined;
    },
    isProject: function (): boolean {
      return (
        (this.item.id && !this.item.id.startsWith("P")) ||
        (this.editing && !this.id.startsWith("P"))
      );
    },
  },
  watch: {
    id: function (id) {
      this.setItem(id);
    }, // first arg is newVal, second is oldVal
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
    this.collectionObject = collection(db, this.collectionName);
    this.setItem(this.id);
    this.profileSecretsDoc = doc(db, "ProfileSecrets", this.user.uid);
    this.setupAlgolia();
  },
  methods: {
    updateCategoriesInput() {
      // This is triggered every time the input field changes. If the last
      // character is a comma, then we add the text to the categories array.
      // Otherwise we do nothing.
      if (this.categoriesInput.endsWith(",")) {
        const category = this.categoriesInput.slice(
          0,
          this.categoriesInput.length - 1
        );
        // if item.categories is undefined, create it
        if (this.item.categories === undefined) {
          this.item.categories = [];
        }

        this.item.categories.push(category.trim());
        this.categoriesInput = "";
      }
    },
    deleteCategory(index: number) {
      this.item.categories.splice(index, 1);
    },
    shortDateWithWeekday,
    deleteDivision(index: number) {
      this.item.divisions.splice(index, 1);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addDivision(item: any) {
      const division = item.objectID;
      this.item.divisions.push(division);
    },
    async setupAlgolia() {
      // setup algolia autocomplete
      const profileSecrets = await getDoc(
        doc(db, "ProfileSecrets", this.user.uid)
      );
      // This gets triggered when the user selects an item from the autocomplete
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const writeManagerToItem = (values: any) => {
        this.managerUid = values.objectID;
        this.item.managerDisplayName = values.displayName;
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const writeAlternateManagerToItem = (values: any) => {
        this.alternateManagerUid = values.objectID;
        this.item.alternateManagerDisplayName = values.displayName;
      };
      const searchClient = algoliasearch(
        "F7IPMZB3IW",
        profileSecrets.get("algoliaSearchKey")
      );
      autocomplete({
        container: "#managerAutocomplete",
        placeholder: "staff...",
        getSources() {
          return [
            {
              sourceId: "managers",
              onSelect({ item }) {
                writeManagerToItem(item);
              },
              templates: {
                item({ item }) {
                  return `${item.displayName}`;
                },
              },
              getItems({ query }) {
                return getAlgoliaResults({
                  searchClient,
                  queries: [
                    {
                      indexName: "tybalt_profiles",
                      query,
                    },
                  ],
                });
              },
            },
          ];
        },
      });
      autocomplete({
        container: "#alternateManagerAutocomplete",
        placeholder: "staff...",
        getSources() {
          return [
            {
              sourceId: "alternateManagers",
              onSelect({ item }) {
                writeAlternateManagerToItem(item);
              },
              templates: {
                item({ item }) {
                  return `${item.displayName}`;
                },
              },
              getItems({ query }) {
                return getAlgoliaResults({
                  searchClient,
                  queries: [
                    {
                      indexName: "tybalt_profiles",
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
    setItem(id: string) {
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }
      if (id) {
        getDoc(doc(this.collectionObject, id)).then(
          (snap: DocumentSnapshot) => {
            const result = snap.data();
            if (result === undefined) {
              // A document with this id doesn't exist in the database,
              // list instead.
              this.$router.push(this.parentPath);
            } else {
              this.item = result;
              this.managerUid = result.managerUid || undefined;
              this.alternateManagerUid =
                result.alternateManagerUid || undefined;
              // if editing a document that doesn't yet have a divisions array,
              // create an empty one so that we can push to it
              if (this.item.divisions === undefined) {
                this.item.divisions = [];
              }

              // if the document is missing an fnAgreement field, set it false
              if (this.item.fnAgreement === undefined) {
                this.item.fnAgreement = false;
              }

              // set the Timestamps to dates for the datepicker
              if (this.id.startsWith("P")) {
                this.item.proposalOpeningDate =
                  result.proposalOpeningDate.toDate();
                this.item.proposalSubmissionDueDate =
                  result.proposalSubmissionDueDate.toDate();
              } else {
                this.item.projectAwardDate = result.projectAwardDate.toDate();
              }
            }
          }
        );
      }
      // the default value are set in the data() function or in clearEditor()
    },
    save() {
      this.item = _.pickBy(this.item, (i) => i !== ""); // strip blank fields

      // delete the legacy manager field
      // TODO:*** This is temporary, until all the old data is migrated ***
      delete this.item.manager;

      // set the manager UIDs
      if (this.managerUid !== undefined) {
        this.item.managerUid = this.managerUid;
      } else {
        delete this.item.managerUid;
      }
      if (this.alternateManagerUid !== undefined) {
        this.item.alternateManagerUid = this.alternateManagerUid;
      } else {
        delete this.item.alternateManagerUid;
      }
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }

      // if the categories property is an empty array, delete it
      if (this.item.categories?.length === 0) {
        delete this.item.categories;
      }

      if (this.id) {
        // Editing an existing item
        // Since the UI binds existing id to the key field, no need to delete
        setDoc(doc(this.collectionObject, this.id), this.item)
          .then(() => {
            this.$router.go(-1);
            // this.$router.push(this.parentPath);
          })
          .catch((error: unknown) => {
            // If the value of this.item.status is "Cancelled" or the value is
            // "Closed" and this is a project, then prompt whether the user
            // would like to force this save despite being an invalid job.
            if (
              this.item.status === "Cancelled" ||
              (this.item.status === "Closed" && !this.id.startsWith("P"))
            ) {
              if (
                confirm(
                  `This job is invalid. Are you sure you want to force its status to ${this.item.status}?`
                )
              ) {
                updateDoc(doc(db, this.collectionName, this.id), {
                  status: this.item.status,
                })
                  .then(() => {
                    // console.log("Forced save successful");
                    this.$router.go(-1);
                    // this.$router.push(this.parentPath);
                  })
                  .catch((error: unknown) => {
                    // console.log("Forced save failed");
                    if (error instanceof Error) {
                      alert(`Editing failed: ${error.message}`);
                    } else alert(`Editing failed: ${JSON.stringify(error)}`);
                  });
              }
            } else if (error instanceof Error) {
              alert(`Editing failed: ${error.message}`);
            } else alert(`Editing failed: ${JSON.stringify(error)}`);
          });
      } else {
        // Creating a new item
        const newId = this.item.id;
        delete this.item.id;

        // set the default for hasTimeEntries
        this.item.hasTimeEntries = false;

        // check that the job number is not a duplicate of an existing job
        // number. Do this by first checking the server for the job number if we
        // are NOT editing, and if it exists, throw an error.
        return runTransaction(db, async (transaction) => {
          const docRef = doc(db, this.collectionName, newId);
          return transaction.get(docRef).then((snap: DocumentSnapshot) => {
            if (snap.exists()) {
              throw new Error(
                `Job number ${newId} already exists. Please choose a different job number.`
              );
            }
            transaction.set(docRef, this.item);
          });
        })
          .then(() => {
            this.clearEditor();
            // notify user save is done
          })
          .catch((error: unknown) => {
            if (error instanceof Error) {
              alert(`Creating failed: ${error.message}`);
            } else alert(`Creating failed: ${JSON.stringify(error)}`);
          });
      }
    },
    clearEditor() {
      this.item = { status: "", divisions: [] } as DocumentData;
    },
  },
});
</script>
<style lang="scss" scoped>
@import "./algolia-autocomplete-classic-fork.scss";
.jobDateField {
  font-size: 1em !important;
  padding: 0;
}

button.del_but {
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
button.del_but:hover {
  transition: filter 0.05s ease-in;
  filter: drop-shadow(2px 2px 1px rgb(0 0 0 / 0.3));
}

button:active {
  filter: brightness(0.7) drop-shadow(1px 1px 1px rgb(0 0 0 / 0.3));
}
</style>
