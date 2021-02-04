<template>
  <form id="editor">
    <span class="field">
      <datepicker
        name="datepicker"
        input-class="calendar-input"
        wrapper-class="calendar-wrapper"
        placeholder="Date"
        :inline="false"
        :disabledDates="dps.disabled"
        :highlighted="dps.highlighted"
        v-model="item.date"
      />
    </span>
    <span class="field">
      <label for="total">Total $</label>
      <input type="number" name="total" v-model.number="item.total" />
    </span>

    <span class="field">
      <label for="job">Job</label>
      <!-- TODO: Show job description/client in uneditable part of field -->
      <input
        type="text"
        name="job"
        placeholder="Project or Proposal number"
        v-bind:value="item.job"
        v-on:keydown.arrow-down="onArrowDown"
        v-on:keydown.arrow-up="onArrowUp"
        v-on:keyup.enter="setJob(jobCandidates[selectedIndex].id)"
        v-on:input="updateJobCandidates"
      />
    </span>
    <div id="suggestions" v-if="showSuggestions && jobCandidates.length > 0">
      <ul>
        <li
          v-for="(c, index) in jobCandidates"
          v-bind:class="{ selected: index === selectedIndex }"
          v-bind:key="c.id"
          v-on:click="setJob(c.id)"
        >
          {{ c.id }} - {{ c.client }}: {{ c.description }}
        </li>
      </ul>
    </div>

    <span class="field">
      <input
        type="text"
        name="po"
        placeholder="Purchase Order Number"
        v-model.trim="item.po"
      />
    </span>

    <span class="field">
      <input
        type="text"
        name="description"
        placeholder="Expense Description"
        v-model.trim="item.description"
      />
    </span>

    <span class="field">
      <label for="attachment">Attachment</label>
      <input type="file" name="attachment" v-on:change="validateFile" />
    </span>

    <span class="field">
      <button type="button" v-if="validItem" v-on:click="save()">Save</button>
      <button type="button" v-on:click="$router.push(parentPath)">
        Cancel
      </button>
    </span>
  </form>
</template>

<script lang="ts">
import Vue from "vue";
import firebase from "../firebase";
const db = firebase.firestore();
import { mapState } from "vuex";
import Datepicker from "vuejs-datepicker";
import { addWeeks, subWeeks } from "date-fns";
import _ from "lodash";
import { sha256 } from "js-sha256";

interface HTMLInputEvent extends Event {
  target: HTMLInputElement & EventTarget;
}

export default Vue.extend({
  components: { Datepicker },
  props: ["id", "collection"],
  data() {
    return {
      dps: {
        // date picker state
        disabled: {
          to: subWeeks(new Date(), 4),
          from: addWeeks(new Date(), 4)
        },
        highlighted: {
          dates: [new Date()]
        }
      },
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      showSuggestions: false,
      selectedIndex: null as number | null,
      jobCandidates: [] as firebase.firestore.DocumentData[],
      item: {} as firebase.firestore.DocumentData,
      validAttachment: true,
    };
  },
  computed: {
    ...mapState(["user"]),
    validItem(): boolean {
      // TODO: build out client-side validation
      const validDescription =
        typeof this.item.description === "string" &&
        this.item.description.length > 4;
      const validTotal =
        typeof this.item.total === "number" && this.item.total > 0;
      return validTotal && validDescription && this.validAttachment;
    },
  },
  watch: {
    id: function (id) {
      this.setItem(id);
    },
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
    this.collectionObject = db.collection(this.collection);
    this.setItem(this.id);
  },
  methods: {
    async validateFile(event: HTMLInputEvent) {
      this.validAttachment = false;
      const allowedTypes: { [subtype: string]: string } = {
        pdf: "pdf",
        jpeg: "jpeg",
        png: "png",
      };
      const files = event.target.files;
      if (files && files[0]) {
        const file = files[0];
        const reader = new FileReader();
        reader.onload = async (event: ProgressEvent) => {
          const checksum = sha256(reader.result as ArrayBuffer);
          const subtype = file.type.replace(/.+\//g, "");
          if (subtype in allowedTypes) {
            const extension = allowedTypes[subtype];
            const pathReference = [
              this.user.uid,
              [checksum, extension].join("."),
            ].join("/");

            // Notify if the file already exist in storage,
            // otherwise set a flag and save the ref to item
            const storage = firebase.storage();
            const attachmentRef = storage.ref(`Expenses/${pathReference}`);
            let url;
            try {
              url = await attachmentRef.getDownloadURL();
              delete this.item.attachment;
              this.validAttachment = false;
              alert(`${url} was previously uploaded`);
            } catch (error) {
              if (error.code === "storage/object-not-found") {
                this.item.attachment = pathReference;
                this.validAttachment = true;
              }
            }
          } else {
            delete this.item.attachment;
            this.validAttachment = false;
          }
        };
        return reader.readAsArrayBuffer(file);
      }
    },
    async setItem(id: string) {
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }
      if (id) {
        this.collectionObject
          .doc(id)
          .get()
          .then((snap: firebase.firestore.DocumentSnapshot) => {
            const result = snap.data();
            if (result === undefined) {
              // A document with this id doesn't exist in the database,
              // list instead.
              this.$router.push(this.parentPath);
            } else {
              this.item = result;
              this.item.date = result.date.toDate();
            }
          })
          .catch(() => {
            this.$router.push(this.parentPath);
          });
      } else {
        const profile = await db
          .collection("Profiles")
          .doc(this.user.uid)
          .get();

        this.item = {
          date: new Date(),
          uid: this.user.uid,
          displayName: profile.get("displayName"),
          givenName: profile.get("givenName"),
          surname: profile.get("surname"),
          managerName: profile.get("managerName"),
          managerUid: profile.get("managerUid"),
          submitted: false,
          approved: false,
          committed: false,
        };
      }
    },
    setJob(id: string) {
      this.item.job = id;
      this.showSuggestions = false;
      const job = this.jobCandidates.filter(i => i.id === id)[0];
      this.item.jobDescription = job.description;
      this.item.client = job.client;
    },
    onArrowUp() {
      const count = this.jobCandidates.length;
      this.selectedIndex =
        this.selectedIndex === null
          ? count - 1
          : (this.selectedIndex + count - 1) % count;
      this.item.job = this.jobCandidates[this.selectedIndex].id;
    },
    onArrowDown() {
      const count = this.jobCandidates.length;
      this.selectedIndex =
        this.selectedIndex === null ? 0 : (this.selectedIndex + 1) % count;
      this.item.job = this.jobCandidates[this.selectedIndex].id;
    },
    // any annotation in next line due to the following:
    // https://forum.vuejs.org/t/how-to-get-typescript-method-callback-working/36825
    updateJobCandidates: _.debounce(function(this: any, e: Event) {
      // TODO: possibly use full text search like
      // https://www.npmjs.com/package/adv-firestore-functions
      this.showSuggestions = true;
      const loBound = (e.target as HTMLInputElement).value.trim();
      if (loBound.length > 0) {
        const hiBound = (e.target as HTMLInputElement).value.trim() + "\uf8ff";
        this.item.job = loBound; // preserve the value in the input field
        this.$bind(
          "jobCandidates",
          db
            .collection("Jobs")
            .where(firebase.firestore.FieldPath.documentId(), ">=", loBound)
            .where(firebase.firestore.FieldPath.documentId(), "<=", hiBound)
            .limit(5)
        );
      } else {
        this.jobCandidates = [];
        delete this.item.job;
      }
    }, 500),
    save() {
      this.item = _.pickBy(this.item, (i) => i !== ""); // strip blank fields

      if (this.item.job && this.item.job.length < 6) {
        delete this.item.job;
        delete this.item.jobDescription;
        delete this.item.client;
      }

      // Write to database
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }

      if (this.id) {
        // Editing an existing item
        this.collectionObject
          .doc(this.id)
          .set(this.item)
          .then(() => {
            this.$router.push(this.parentPath);
          })
          .catch(error => {
            console.log(this.item);
            alert(`Failed to edit Expense Entry: ${error.message}`);
          });
      } else {
        // Creating a new item
        this.collectionObject
          .doc()
          .set(this.item)
          .then(() => {
            this.$router.push(this.parentPath);
          })
          .catch(error => {
            console.log(this.item);
            alert(`Failed to create Expense Entry: ${error.message}`);
          });
      }
    }
  }
});
</script>
<style>
#suggestions {
  padding: 0.25em;
  border-radius: 0em 0em 1em 1em;
  border-bottom: 1px solid #ccc;
  border-left: 1px solid #ccc;
  border-right: 1px solid #ccc;
}
#suggestions ul,
#suggestions li {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  list-style-type: none;
}
#suggestions li.selected,
#suggestions li:hover {
  background-color: #ddd;
}
/* https://www.digitalocean.com/community/tutorials/vuejs-vue-autocomplete-component#async-loading */
</style>