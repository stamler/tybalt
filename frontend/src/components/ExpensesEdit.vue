<template>
  <form id="editor">
    <datepicker
      name="datepicker"
      placeholder="Date"
      :auto-apply="true"
      :max-date="dps.disabled.from"
      :highlight="dps.highlighted.dates"
      :enable-time-picker="false"
      :format="shortDateWithWeekday"
      week-start="0"
      hide-input-icon
      input-class-name="field"
      v-model="item.date"
    />
    <span class="field">
      <select class="grow" name="division" v-model="item.division">
        <option disabled selected value="">-- choose division --</option>
        <option v-for="d in divisions" :value="d.id" v-bind:key="d.id">
          {{ d.name }}
        </option>
      </select>
    </span>

    <span class="field">
      <label for="paymentType">Type:</label>
      <select class="grow" name="paymentType" v-model="item.paymentType">
        <option value="Allowance">Daily Allowance</option>
        <option value="FuelCard">Fuel Card</option>
        <!--<option value="FuelOnAccount">Fuel On Account</option> -->
        <option value="CorporateCreditCard">Corp Visa</option>
        <option value="Expense">Expense</option>
        <option value="Mileage">
          <!-- NB: This mileage rate doesn't update in realtime because the
          profile is loaded once in setItem() -->
          Personal Mileage ${{ getMileageRate(item.date, profile) }}/km
        </option>
        <option v-if="allowPersonalReimbursement" value="PersonalReimbursement">
          Personal Reimbursement
        </option>
      </select>
    </span>
    <span v-if="mileageTokensInDescWhileOtherPaymentType" class="attention">
      ^Should you choose personal mileage instead?
    </span>
    <span
      class="field"
      v-if="['FuelCard', 'CorporateCreditCard'].includes(item.paymentType)"
    >
      <label for="ccLast4digits">Last 4 digits of Card</label>
      <input
        class="grow"
        type="text"
        name="ccLast4digits"
        v-model="item.ccLast4digits"
        placeholder="0000"
      />
    </span>
    <span v-if="!validInsuranceExpiry" class="attention"
      >You do not have valid personal vehicle insurance in your profile. Please
      contact HR to update your profile prior to submitting a personal mileage
      expense.
    </span>
    <span
      class="field"
      v-if="!['Mileage', 'Allowance'].includes(item.paymentType)"
    >
      <label for="total">Total $</label>
      <input
        class="grow"
        type="number"
        name="total"
        v-model.number="item.total"
        step="0.01"
        min="0"
        placeholder="including any tax"
      />
    </span>

    <span
      class="field"
      v-if="
        !['Mileage', 'Allowance', 'PersonalReimbursement'].includes(
          item.paymentType
        )
      "
    >
      <label for="vendorName">Vendor Name</label>
      <input
        class="grow"
        type="text"
        name="vendorName"
        v-model.trim="item.vendorName"
        placeholder="Acme Co."
      />
    </span>

    <span class="field" v-if="item.paymentType === 'FuelOnAccount'">
      <label for="unitNumber">Unit #</label>
      <input
        class="grow"
        type="number"
        name="unitNumber"
        placeholder="00"
        v-model.number="item.unitNumber"
        step="1.0"
        min="1"
      />
    </span>
    <span class="field" v-if="item.paymentType === 'Allowance'">
      <label for="breakfast" class="checkoption">
        <input type="checkbox" id="breakfast" v-model="item.breakfast" />
        Breakfast (${{ getExpenseRate("BREAKFAST_RATE", item.date) }})
      </label>
      <label for="lunch" class="checkoption">
        <input class="grow" type="checkbox" id="lunch" v-model="item.lunch" />
        Lunch (${{ getExpenseRate("LUNCH_RATE", item.date) }})
      </label>
      <label for="dinner" class="checkoption">
        <input class="grow" type="checkbox" id="dinner" v-model="item.dinner" />
        Dinner (${{ getExpenseRate("DINNER_RATE", item.date) }})
      </label>
      <label for="lodging" class="checkoption">
        <input
          class="grow"
          type="checkbox"
          id="lodging"
          v-model="item.lodging"
        />
        Personal Accommodation (${{
          getExpenseRate("LODGING_RATE", item.date)
        }})
      </label>
    </span>
    <span class="field">
      <label for="job">Job</label>
      <input
        class="jobNumberInput"
        type="text"
        name="job"
        placeholder="Proj/Prop"
        v-bind:value="item.job"
        v-on:keydown.arrow-down="onArrowDown"
        v-on:keydown.arrow-up="onArrowUp"
        v-on:keyup.enter="setJob(jobCandidates[selectedIndex].id)"
        v-on:input="updateJobCandidates"
      />
      <span class="jobDescription">{{ item.jobDescription }}</span>
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

    <span
      class="field"
      v-if="
        ![
          'Mileage',
          'FuelOnAccount',
          'FuelCard',
          'Allowance',
          'PersonalReimbursement',
        ].includes(item.paymentType)
      "
    >
      <input
        class="grow"
        type="text"
        name="po"
        placeholder="Purchase Order Number"
        v-model.trim="item.po"
      />
    </span>

    <span
      class="field"
      v-if="!['Allowance', 'FuelOnAccount'].includes(item.paymentType)"
    >
      <input
        class="grow"
        type="text"
        name="description"
        v-bind:placeholder="
          item.paymentType === 'Mileage'
            ? 'Where did you go & why?'
            : 'Expense Description (4 char minimum)'
        "
        v-model.trim="item.description"
      />
    </span>

    <span
      class="field"
      v-if="
        !['Mileage', 'Allowance', 'PersonalReimbursement'].includes(
          item.paymentType
        )
      "
    >
      <label for="attachment">Attachment</label>
      <span v-if="item.attachment">
        <action-button
          type="download"
          @click.prevent="downloadAttachment(item)"
        />
        <action-button
          type="removefile"
          @click.prevent="delete item.attachment"
        />
      </span>
      <span v-else>
        <input
          class="grow"
          type="file"
          name="attachment"
          v-on:change="updateAttachment"
        />
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
        class="grow"
        type="number"
        name="distance"
        v-model.number="item.distance"
        step="1.0"
        min="0"
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
import { defineComponent } from "vue";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  collection,
  CollectionReference,
  DocumentData,
  DocumentSnapshot,
  getDoc,
  query,
  where,
  limit,
  doc,
  documentId,
  setDoc,
  FirestoreError,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  getDownloadURL,
  StorageError,
  uploadBytes,
} from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useCollection } from "vuefire";
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);
const functions = getFunctions(firebaseApp);
import { useStateStore } from "../stores/state";
import Datepicker from "@vuepic/vue-datepicker";
import { addWeeks } from "date-fns";
import { isInteger, pickBy, debounce, defaults } from "lodash";
import { sha256 } from "js-sha256";
import ActionButton from "./ActionButton.vue";
import { format } from "date-fns";
import { utcToZonedTime } from "date-fns-tz";
import { downloadAttachment, shortDateWithWeekday } from "./helpers";

interface HTMLInputEvent extends Event {
  target: HTMLInputElement & EventTarget;
}

// a typeguard for HTTMLInputEvent
function isHTMLInputEvent(event: Event): event is HTMLInputEvent {
  return "target" in event;
}

export default defineComponent({
  setup() {
    const store = useStateStore();
    const { startTask, endTask } = store;
    return {
      startTask,
      endTask,
      user: store.user,
      expenseRates: store.expenseRates,
    };
  },
  components: { ActionButton, Datepicker },
  props: ["id", "collectionName"],
  data() {
    return {
      dps: {
        // date picker state
        disabled: {
          //to: subWeeks(new Date(), 6),
          from: addWeeks(new Date(), 4),
        },
        highlighted: {
          dates: [new Date()],
        },
      },
      parentPath: "",
      collectionObject: null as CollectionReference | null,
      divisions: useCollection(collection(db, "Divisions")),
      showSuggestions: false,
      selectedIndex: 0 as number,
      jobCandidates: [] as DocumentData[],
      item: {} as DocumentData,
      profile: {} as DocumentData,
      allowPersonalReimbursement: false,
      //expensetypes: [] as DocumentData[],
      attachmentPreviouslyUploaded: false,
      validAttachmentType: true,
      newAttachment: null as string | null,
      localFile: {} as File,
    };
  },
  computed: {
    mileageTokensInDescWhileOtherPaymentType(): boolean {
      if (
        this.item.paymentType !== undefined &&
        this.item.description !== undefined
      ) {
        const lowercase = this.item.description.toLowerCase().trim();
        const lowercaseTokens = lowercase.split(/\s+/);
        return (
          !["Mileage", "FuelCard"].includes(this.item.paymentType) &&
          [
            "mileage",
            "miles",
            "distance",
            "travel",
            "travelled",
            "km",
            "kms",
            "kilometers",
            "kilometres",
            "drove",
            "drive",
          ].some((token) => lowercaseTokens.includes(token))
        );
      }
      return false;
    },
    validItem(): boolean {
      // TODO: build out client-side validation
      const validVendor =
        (typeof this.item.vendorName === "string" &&
          this.item.vendorName.length > 2) ||
        ![
          "Expense",
          "FuelCard",
          "FuelOnAccount",
          "CorporateCreditCard",
        ].includes(this.item.paymentType);
      const validDescription =
        (typeof this.item.description === "string" &&
          this.item.description.length > 3) ||
        ["Allowance", "FuelOnAccount"].includes(this.item.paymentType);
      const validTotal =
        (typeof this.item.total === "number" && this.item.total > 0) ||
        this.item.paymentType === "Allowance";
      const validDistance =
        typeof this.item.distance === "number" &&
        isInteger(this.item.distance) &&
        this.item.distance > 0;
      return (
        (validTotal || validDistance) &&
        validDescription &&
        validVendor &&
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
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
    this.collectionObject = collection(db, this.collectionName);
    this.cleanup();
    //this.$bind("expensetypes", db.collection("ExpenseTypes"));
    this.setItem(this.id);
  },
  methods: {
    downloadAttachment,
    shortDateWithWeekday,
    // get the value of an expense rate on a specified date
    getExpenseRate(rate: string, date: Date | undefined) {
      if (this.expenseRates === null) return 0;
      if (date === undefined) return 0;
      // get the timezone of the user
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // make an ISO string from the date
      const ISODate = format(utcToZonedTime(date, timezone), "yyyy-MM-dd");
      // sort dates in descending order
      const dates = Object.keys(this.expenseRates).sort().reverse();
      // find the first date that is less than or equal to the specified date
      const index = dates.findIndex((d: string) => d <= ISODate);
      if (this.expenseRates?.[dates[index]]?.[rate] === undefined) {
        throw new Error(`No expense rate found for ${rate} on ${date}`);
      }
      return this.expenseRates?.[dates[index]]?.[rate];
    },
    getMileageRate(date: Date | undefined, profile: DocumentData) {
      if (this.expenseRates === null) return 0;
      if (date === undefined) return 0;
      if (profile === undefined) return 0;
      const previousMileage = profile.get("mileageClaimed");
      if (previousMileage === undefined) return 0;
      const rateMap = this.getExpenseRate("MILEAGE", date);
      const tiers = Object.keys(rateMap).sort(
        (a, b) => parseInt(b, 10) - parseInt(a, 10)
      );
      const index = tiers.findIndex(
        (d: string) => previousMileage >= parseInt(d, 10)
      );
      return rateMap[tiers[index]];
    },
    cleanup() {
      // clean up any existing orphaned attachments
      const cleanup = httpsCallable(
        functions,
        "cleanUpUsersExpenseAttachments"
      );
      return cleanup().catch((error: unknown) => {
        alert(`Attachment cleanup failed: ${JSON.stringify(error)}`);
      });
    },
    async updateAttachment(event: Event) {
      if (!isHTMLInputEvent(event)) {
        throw new Error("Event is not an HTMLInputEvent");
      }
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
        reader.onload = async (/*event: ProgressEvent*/) => {
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
            // let url;
            try {
              /*url = */ await getDownloadURL(ref(storage, pathReference));
              this.attachmentPreviouslyUploaded = true;
            } catch (error) {
              const err = error as StorageError;
              if (err.code === "storage/object-not-found") {
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
      this.profile = await getDoc(doc(db, "Profiles", this.user.uid));
      this.allowPersonalReimbursement =
        this.profile.get("allowPersonalReimbursement") || false;
      if (id) {
        getDoc(doc(this.collectionObject, id))
          .then((snap: DocumentSnapshot) => {
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
          payrollId: this.profile.get("payrollId"),
          paymentType: "Allowance",
          submitted: false,
          approved: false,
        };
      }
    },
    setJob(id: string) {
      this.item.job = id;
      this.showSuggestions = false;
      const job = this.jobCandidates.filter(
        (i: DocumentData) => i.id === id
      )[0];
      this.item.jobDescription = job.description;
      this.item.client = job.client;
    },
    onArrowUp() {
      const count = this.jobCandidates.length;
      this.selectedIndex = (this.selectedIndex + count - 1) % count;
      this.item.job = this.jobCandidates[this.selectedIndex].id;
    },
    onArrowDown() {
      const count = this.jobCandidates.length;
      this.selectedIndex = (this.selectedIndex + 1) % count;
      this.item.job = this.jobCandidates[this.selectedIndex].id;
    },
    // any annotation in next line due to the following:
    // https://forum.vuejs.org/t/how-to-get-typescript-method-callback-working/36825
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateJobCandidates: debounce(function (this: any, e: Event) {
      // TODO: possibly use full text search like
      // https://www.npmjs.com/package/adv-firestore-functions
      this.showSuggestions = true;
      const loBound = (e.target as HTMLInputElement).value.trim();
      if (loBound.length > 0) {
        const hiBound = (e.target as HTMLInputElement).value.trim() + "\uf8ff";
        this.item.job = loBound; // preserve the value in the input field
        this.$firestoreBind(
          "jobCandidates",
          query(
            collection(db, "Jobs"),
            where(documentId(), ">=", loBound),
            where(documentId(), "<=", hiBound),
            limit(5)
          )
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
      this.item = pickBy(this.item, (i) => i !== ""); // strip blank fields
      delete this.item.rejected;
      delete this.item.rejectorId;
      delete this.item.rejectorName;
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
          (i: DocumentData) => i.id === this.item.division
        )[0].name;
      } else {
        throw "Division Missing";
      }

      // if paymentType is Allowance, delete total and description and set
      // unset meal types to false
      if (this.item.paymentType === "Allowance") {
        defaults(this.item, {
          breakfast: false,
          lunch: false,
          dinner: false,
          lodging: false,
        });
        delete this.item.description;
        delete this.item.total;
      }

      // TODO: catch the above throw and notify the user.
      // TODO: build more validation here to notify the user of errors
      // before hitting the backend.

      // If there's an attachment, upload it. If successful
      // complete the rest. Otherwise cleanup and abort.
      let uploadFailed = false;
      if (this.newAttachment !== null) {
        this.startTask({
          id: `upload${this.newAttachment}`,
          message: "uploading",
        });

        // upload the attachment
        try {
          await uploadBytes(ref(storage, this.newAttachment), this.localFile);
          uploadFailed = false;
          this.endTask(`upload${this.newAttachment}`);
        } catch (error) {
          this.endTask(`upload${this.newAttachment}`);
          alert(`Attachment Upload failed: ${error}`);
          uploadFailed = true;
        }
      }

      // Create or edit the document
      if (!uploadFailed) {
        const currentDoc = this.id
          ? doc(this.collectionObject, this.id)
          : doc(this.collectionObject);

        try {
          if (this.newAttachment !== null) {
            // a new attachment was successfully uploaded, save in document
            this.item.attachment = this.newAttachment;
          }
          await setDoc(currentDoc, this.item);
          this.$router.push(this.parentPath);
        } catch (error) {
          const err = error as FirestoreError;
          alert(`Failed to edit Expense Entry: ${err.message}`);
        }
      } else {
        alert("Uploading the attachment failed");
      }
    },
  },
});
</script>
<style>
.checkoption {
  border-radius: 0.2em;
  background-color: rgb(240, 228, 255);
  padding-left: 0.2em;
  margin-right: 0.2em;
}
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
