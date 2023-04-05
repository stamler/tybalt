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
    <span
      class="field"
      v-if="
        (item.id && !item.id.startsWith('P')) ||
        (editing && !id.startsWith('P'))
      "
    >
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
  CollectionReference,
  DocumentSnapshot,
  DocumentData,
  DocumentReference,
} from "firebase/firestore";
import ActionButton from "./ActionButton.vue";
import DSStringArrayInput from "./DSStringArrayInput.vue";
import algoliasearch from "algoliasearch/lite";
import { autocomplete, getAlgoliaResults } from "@algolia/autocomplete-js";
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
    DSStringArrayInput,
  },
  data() {
    return {
      parentPath: "",
      collectionObject: null as CollectionReference | null,
      item: { status: "", divisions: [] } as DocumentData,
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
      if (this.id) {
        // Editing an existing item
        // Since the UI binds existing id to the key field, no need to delete
        setDoc(doc(this.collectionObject, this.id), this.item)
          .then(() => {
            this.$router.go(-1);
            // this.$router.push(this.parentPath);
          })
          .catch((error: unknown) => {
            if (error instanceof Error) {
              alert(`Editing failed: ${error.message}`);
            } else alert(`Editing failed: ${JSON.stringify(error)}`);
          });
      } else {
        // Creating a new item
        const newId = this.item.id;
        delete this.item.id;

        // set the default for hasTimeEntries
        this.item.hasTimeEntries = false;

        setDoc(doc(this.collectionObject, newId), this.item)
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
<style lang="scss">
@import "./algolia-autocomplete-classic-fork.scss";
</style>
