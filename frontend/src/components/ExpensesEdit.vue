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

    <!--
    <span class="field">
      <select name="expensetype" v-model="item.expensetype">
        <option v-for="e in expensetypes" :value="e.id" v-bind:key="e.id">
          {{ e.name }}
        </option>
      </select>
    </span>
    -->
    <span class="field">
      <select name="division" v-model="item.division">
        <option disabled selected value="">-- choose division --</option>
        <option v-for="d in divisions" :value="d.id" v-bind:key="d.id">
          {{ d.name }}
        </option>
      </select>
    </span>

    <span class="field">
      <label for="paymentType">Type:</label>
      <select name="paymentType" v-model="item.paymentType">
        <option value="CorporateCreditCard">Corp Visa</option>
        <option value="Expense">Expense</option>
        <option value="Mileage">Personal Mileage</option>
      </select>
    </span>
    <span v-if="!validInsuranceExpiry" class="attention"
      >You do not have valid personal vehicle insurance in your profile. Please
      contact HR to update your profile prior to submitting a personal mileage
      expense.
    </span>
    <span class="field" v-if="item.paymentType !== 'Mileage'">
      <label for="total">Total $</label>
      <input
        type="number"
        name="total"
        v-model.number="item.total"
        placeholder="including any tax"
      />
    </span>

    <span class="field" v-if="item.paymentType !== 'Mileage'">
      <label for="vendorName">Vendor Name</label>
      <input
        type="text"
        name="vendorName"
        v-model.trim="item.vendorName"
        placeholder="Acme Co."
      />
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

    <span class="field" v-if="item.paymentType !== 'Mileage'">
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
        v-bind:placeholder="
          item.paymentType === 'Mileage'
            ? 'Where did you go & why?'
            : 'Expense Description'
        "
        v-model.trim="item.description"
      />
    </span>

    <span class="field" v-if="item.paymentType !== 'Mileage'">
      <label for="attachment">Attachment</label>
      <span v-if="item.attachment">
        <router-link to="#" v-on:click.native="downloadAttachment(item)">
          <download-icon></download-icon>
        </router-link>
        <router-link to="#" v-on:click.native="$delete(item, 'attachment')">
          <file-minus-icon></file-minus-icon>
        </router-link>
      </span>
      <span v-else>
        <input type="file" name="attachment" v-on:change="updateAttachment" />
        <span v-if="attachmentPreviouslyUploaded" class="attention">
          Previously uploaded
        </span>
        <span v-if="!validAttachmentType" class="attention">
          only png, jpeg & pdf accepted
        </span>
      </span>
    </span>

    <span class="field" v-if="item.paymentType === 'Mileage'">
      <input
        type="number"
        name="distance"
        v-model.number="item.distance"
        placeholder="distance travelled (km)"
      />
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
import mixins from "./mixins";
import firebase from "../firebase";
const db = firebase.firestore();
const storage = firebase.storage();
import store from "../store";
import { mapState } from "vuex";
import Datepicker from "vuejs-datepicker";
import { addWeeks, subWeeks } from "date-fns";
import _, { isInteger } from "lodash";
import { sha256 } from "js-sha256";
import { DownloadIcon, FileMinusIcon } from "vue-feather-icons";

interface HTMLInputEvent extends Event {
  target: HTMLInputElement & EventTarget;
}

export default mixins.extend({
  components: { Datepicker, DownloadIcon, FileMinusIcon },
  props: ["id", "collection"],
  data() {
    return {
      dps: {
        // date picker state
        disabled: {
          to: subWeeks(new Date(), 4),
          from: addWeeks(new Date(), 4),
        },
        highlighted: {
          dates: [new Date()],
        },
      },
      parentPath: "",
      collectionObject: null as firebase.firestore.CollectionReference | null,
      divisions: [] as firebase.firestore.DocumentData[],
      showSuggestions: false,
      selectedIndex: null as number | null,
      jobCandidates: [] as firebase.firestore.DocumentData[],
      item: {} as firebase.firestore.DocumentData,
      profile: {} as firebase.firestore.DocumentData,
      //expensetypes: [] as firebase.firestore.DocumentData[],
      attachmentPreviouslyUploaded: false,
      validAttachmentType: true,
      newAttachment: null as string | null,
      localFile: {} as File,
    };
  },
  computed: {
    ...mapState(["user"]),
    validItem(): boolean {
      // TODO: build out client-side validation
      const validDescription =
        typeof this.item.description === "string" &&
        this.item.description.length > 3;
      const validTotal =
        typeof this.item.total === "number" && this.item.total > 0;
      const validDistance =
        typeof this.item.distance === "number" &&
        isInteger(this.item.distance) &&
        this.item.distance > 0;
      return (
        (validTotal || validDistance) &&
        validDescription &&
        !this.attachmentPreviouslyUploaded &&
        this.validAttachmentType
      );
    },
    validInsuranceExpiry(): boolean {
      if (this.item.paymentType === "Mileage") {
        const expiryDate = this.profile.get("personalVehicleInsuranceExpiry");
        return expiryDate === undefined
          ? false
          : expiryDate.toDate() >= this.item.date;
      }
      return true;
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
    //this.$bind("expensetypes", db.collection("ExpenseTypes"));
    this.$bind("divisions", db.collection("Divisions"));
    this.setItem(this.id);
  },
  methods: {
    async updateAttachment(event: HTMLInputEvent) {
      this.attachmentPreviouslyUploaded = false;
      const allowedTypes: { [subtype: string]: string } = {
        pdf: "pdf",
        jpeg: "jpeg",
        png: "png",
      };
      const files = event.target.files;
      if (files && files[0]) {
        this.localFile = files[0];
        const reader = new FileReader();
        reader.onload = async (event: ProgressEvent) => {
          const checksum = sha256(reader.result as ArrayBuffer);
          const subtype = this.localFile.type.replace(/.+\//g, "");
          if (subtype in allowedTypes) {
            this.validAttachmentType = true;
            const extension = allowedTypes[subtype];
            const pathReference = [
              "Expenses",
              this.user.uid,
              [checksum, extension].join("."),
            ].join("/");

            // Notify if the file already exist in storage,
            // otherwise set a flag and save the ref to item
            let url;
            try {
              url = await storage.ref(pathReference).getDownloadURL();
              this.attachmentPreviouslyUploaded = true;
            } catch (error) {
              if (error.code === "storage/object-not-found") {
                this.newAttachment = pathReference;
                this.attachmentPreviouslyUploaded = false;
              }
            }
          } else {
            this.validAttachmentType = false;
          }
        };
        return reader.readAsArrayBuffer(this.localFile);
      }
    },
    async setItem(id: string) {
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }
      this.profile = await db.collection("Profiles").doc(this.user.uid).get();
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
        this.item = {
          date: new Date(),
          uid: this.user.uid,
          displayName: this.profile.get("displayName"),
          givenName: this.profile.get("givenName"),
          surname: this.profile.get("surname"),
          managerName: this.profile.get("managerName"),
          managerUid: this.profile.get("managerUid"),
          division: this.profile.get("defaultDivision"),
          paymentType: "Expense",
          submitted: false,
          approved: false,
        };
      }
    },
    setJob(id: string) {
      this.item.job = id;
      this.showSuggestions = false;
      const job = this.jobCandidates.filter((i) => i.id === id)[0];
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
    updateJobCandidates: _.debounce(function (this: any, e: Event) {
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
    async save() {
      // Write to database
      if (this.collectionObject === null) {
        throw "There is no valid collection object";
      }

      if (this.attachmentPreviouslyUploaded === true) {
        throw "You cannot upload a proof of expense twice";
      }
      // TODO: restrict uploading twice in the backend

      /*
      // Populate the Expense Type Name
      this.item.expensetypeName = this.expensetypes.filter(
        (i) => i.id === this.item.expensetype
      )[0].name;
      */
      this.item = _.pickBy(this.item, (i) => i !== ""); // strip blank fields
      delete this.item.rejected;
      delete this.item.rejectionReason;

      if (this.item.job && this.item.job.length < 6) {
        delete this.item.job;
        delete this.item.jobDescription;
        delete this.item.client;
      }

      // division must be present
      if (this.item.division && this.item.division.length > 0) {
        // write divisionName
        this.item.divisionName = this.divisions.filter(
          (i) => i.id === this.item.division
        )[0].name;
      } else {
        throw "Division Missing";
      }

      // TODO: catch the above throw and notify the user.
      // TODO: build more validation here to notify the user of errors
      // before hitting the backend.

      // If there's an attachment, upload it. If successful
      // complete the rest. Otherwise cleanup and abort.
      let uploadFailed = false;
      if (this.newAttachment !== null) {
        store.commit("startTask", {
          id: `upload${this.newAttachment}`,
          message: "uploading",
        });
        try {
          await storage.ref(this.newAttachment).put(this.localFile);
          uploadFailed = false;
          store.commit("endTask", { id: `upload${this.newAttachment}` });
        } catch (error) {
          store.commit("endTask", { id: `upload${this.newAttachment}` });
          alert(`Attachment Upload failed: ${error}`);
          uploadFailed = true;
        }
      }

      // Create or edit the document
      if (!uploadFailed) {
        const doc = this.id
          ? this.collectionObject.doc(this.id)
          : this.collectionObject.doc();

        try {
          if (this.newAttachment !== null) {
            // a new attachment was successfully uploaded, save in document
            this.item.attachment = this.newAttachment;
          }
          await doc.set(this.item);
          this.$router.push(this.parentPath);
        } catch (error) {
          alert(`Failed to edit Expense Entry: ${error.message}`);
        }
      } else {
        alert("Uploading the attachment failed");
      }
    },
  },
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
