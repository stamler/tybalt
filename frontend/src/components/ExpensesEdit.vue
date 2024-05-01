<template>
  <form id="editor">
    <datepicker
      name="datepicker"
      placeholder="Date"
      :auto-apply="true"
      :max-date="dps.disabled.from"
      :highlight="dps.highlight"
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
          Personal Mileage ${{ getMileageRate(item.date) }}/km
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
    <DSJobSelector v-model="item"/>
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

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Profile } from "./types";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  collection,
  DocumentData,
  DocumentSnapshot,
  getDoc,
  doc,
  setDoc,
  FirestoreError,
} from "firebase/firestore";
import {
  getStorage,
  ref as storageRef,
  getDownloadURL,
  StorageError,
  uploadBytes,
} from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useCollection, useDocument } from "vuefire";
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);
const functions = getFunctions(firebaseApp);
import { useStateStore } from "../stores/state";
import Datepicker from "@vuepic/vue-datepicker";
import { addWeeks } from "date-fns";
import { isInteger, pickBy, defaults } from "lodash";
import { sha256 } from "js-sha256";
import ActionButton from "./ActionButton.vue";
import { format } from "date-fns";
import { utcToZonedTime } from "date-fns-tz";
import { downloadAttachment, shortDateWithWeekday } from "./helpers";
import DSJobSelector from "./DSJobSelector.vue";


interface HTMLInputEvent extends Event {
  target: HTMLInputElement & EventTarget;
}

// a typeguard for HTTMLInputEvent
function isHTMLInputEvent(event: Event): event is HTMLInputEvent {
  return "target" in event;
}

const route = useRoute();
const router = useRouter();
const parentPath = ref(route?.matched[route.matched.length - 2]?.path ?? "");

const store = useStateStore();
const { user, expenseRates, startTask, endTask } = store;

const props = defineProps({
  id: {
    // https://vuejs.org/api/utility-types.html#proptype-t
    type: String,
    required: false,
  },
});

const dps = {
  // date picker state
  disabled: {
    //to: subWeeks(new Date(), 6),
    from: addWeeks(new Date(), 4),
  },
  highlight: {
    dates: [new Date()],
  },
};

const expenses = collection(db, "Expenses");
const divisions = useCollection(collection(db, "Divisions"));
const profileDoc = useDocument<Profile>(doc(db, "Profiles", user.uid));

const item = ref({} as DocumentData);
let newAttachment: string | null = null;
let attachmentPreviouslyUploaded = false; // does this have to be reactive? It appears in template. Also check PurchaseOrdersEdit.vue
let localFile = {} as File;
let validAttachmentType = true; // does this have to be reactive? PurchaseOrdersEdit.vue as well
let allowPersonalReimbursement = false; // does this have to be reactive?

const validItem = computed(() => {
  // TODO: build out client-side validation
  const validVendor =
    (typeof item.value.vendorName === "string" &&
      item.value.vendorName.length > 2) ||
    ![
      "Expense",
      "FuelCard",
      "FuelOnAccount",
      "CorporateCreditCard",
    ].includes(item.value.paymentType);
  const validDescription =
    (typeof item.value.description === "string" &&
      item.value.description.length > 3) ||
    ["Allowance", "FuelOnAccount"].includes(item.value.paymentType);
  const validTotal =
    (typeof item.value.total === "number" && item.value.total > 0) ||
    item.value.paymentType === "Allowance";
  const validDistance =
    typeof item.value.distance === "number" &&
    isInteger(item.value.distance) &&
    item.value.distance > 0;
  return (
    (validTotal || validDistance) &&
    validDescription &&
    validVendor &&
    !attachmentPreviouslyUploaded &&
    validAttachmentType
  );
});

const mileageTokensInDescWhileOtherPaymentType = computed(() => {
  if (
    item.value.paymentType !== undefined &&
    item.value.description !== undefined
  ) {
    const lowercase = item.value.description.toLowerCase().trim();
    const lowercaseTokens = lowercase.split(/\s+/);
    return (
      !["Mileage", "FuelCard"].includes(item.value.paymentType) &&
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
});

const validInsuranceExpiry = computed(() => {
  if (item.value.paymentType === "Mileage") {
    const expiryDate = profileDoc.value?.personalVehicleInsuranceExpiry;
    return expiryDate === undefined
      ? false
      : expiryDate.toDate() >= item.value.date;
  }
  return true;
});

watch(
  () => props.id,
  (id) => {
    setItem(id);
  }
);

// get the value of an expense rate on a specified date
const getExpenseRate = function (rate: string, date: Date | undefined) {
  if (expenseRates === null) return 0;
  if (date === undefined) return 0;
  // get the timezone of the user
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // make an ISO string from the date
  const ISODate = format(utcToZonedTime(date, timezone), "yyyy-MM-dd");
  // sort dates in descending order
  const dates = Object.keys(expenseRates).sort().reverse();
  // find the first date that is less than or equal to the specified date
  const index = dates.findIndex((d: string) => d <= ISODate);
  if (expenseRates?.[dates[index]]?.[rate] === undefined) {
    throw new Error(`No expense rate found for ${rate} on ${date}`);
  }
  return expenseRates?.[dates[index]]?.[rate];
};

const getMileageRate = function (date: Date | undefined) {
  const profile = profileDoc.value;
  if (expenseRates === null) return 0;
  if (date === undefined) return 0;
  if (profile === undefined || profile === null) return 0;
  const previousMileage = profile.mileageClaimed;
  if (previousMileage === undefined) return 0;
  const rateMap = getExpenseRate("MILEAGE", date);
  const tiers = Object.keys(rateMap).sort(
    (a, b) => parseInt(b, 10) - parseInt(a, 10)
  );
  const index = tiers.findIndex(
    (d: string) => previousMileage >= parseInt(d, 10)
  );
  return rateMap[tiers[index]];
};

const cleanup = async function () {
  // clean up any existing orphaned attachments
  const cleanup = httpsCallable(
    functions,
    "cleanUpUsersExpenseAttachments"
  );
  return cleanup().catch((error: unknown) => {
    alert(`Attachment cleanup failed: ${JSON.stringify(error)}`);
  });
};

const updateAttachment = async function (event: Event) {
  if (!isHTMLInputEvent(event)) {
    throw new Error("Event is not an HTMLInputEvent");
  }
  attachmentPreviouslyUploaded = false;
  const allowedTypes: { [subtype: string]: string } = {
    pdf: "pdf",
    jpeg: "jpeg",
    png: "png",
  };
  const files = event.target.files;
  if (files && files[0]) {
    localFile = files[0];
    const reader = new FileReader();
    reader.onload = async (/*event: ProgressEvent*/) => {
      const checksum = sha256(reader.result as ArrayBuffer);
      const subtype = localFile.type.replace(/.+\//g, "");
      if (subtype in allowedTypes) {
        validAttachmentType = true;
        const extension = allowedTypes[subtype];
        const pathReference = [
          "Expenses",
          user.uid,
          [checksum, extension].join("."),
        ].join("/");

        // Notify if the file already exist in storage,
        // otherwise set a flag and save the ref to item
        // let url;
        try {
          /*url = */ await getDownloadURL(storageRef(storage, pathReference));
          attachmentPreviouslyUploaded = true;
        } catch (error) {
          const err = error as StorageError;
          if (err.code === "storage/object-not-found") {
            newAttachment = pathReference;
            attachmentPreviouslyUploaded = false;
          }
        }
      } else {
        validAttachmentType = false;
      }
    };
    return reader.readAsArrayBuffer(localFile);
  }
};

const setItem = async function (id: string | undefined) {
  const profile = await profileDoc.promise.value;
  if (!profile) {
    alert("Can't load profile");
    return;
  }
  allowPersonalReimbursement = profile.allowPersonalReimbursement || false;
  if (id) {
    getDoc(doc(expenses, id))
      .then((snap: DocumentSnapshot) => {
        const result = snap.data();
        if (result === undefined) {
          // A document with this id doesn't exist in the database,
          // list instead.
          router.push(parentPath.value);
        } else {
          item.value = result;
          item.value.date = result.date.toDate();
        }
      })
      .catch(() => {
        router.push(parentPath.value);
      });
  } else {
    item.value = {
        date: new Date(),
        uid: user.uid,
        displayName: profile.displayName,
        givenName: profile.givenName,
        surname: profile.surname,
        managerName: profile.managerName,
        managerUid: profile.managerUid,
        division: profile.defaultDivision,
        payrollId: profile.payrollId,
        paymentType: "Allowance",
        submitted: false,
        approved: false,
      };
  }
};

const save = async function () {
  // Write to database
 
  if (attachmentPreviouslyUploaded === true) {
    throw "You cannot upload a proof of expense twice";
  }
  // TODO: restrict uploading twice in the backend

  /*
  // Populate the Expense Type Name
  this.item.expensetypeName = this.expensetypes.filter(
    (i) => i.id === this.item.expensetype
  )[0].name;
  */
  item.value = pickBy(item.value, (i) => i !== ""); // strip blank fields
  delete item.value.rejected;
  delete item.value.rejectorId;
  delete item.value.rejectorName;
  delete item.value.rejectionReason;

  if (item.value.job && item.value.job.length < 6) {
    delete item.value.job;
    delete item.value.jobDescription;
    delete item.value.client;
  }

  // division must be present
  if (item.value.division && item.value.division.length > 0) {
    // write divisionName
    item.value.divisionName = divisions.value.filter(
      (i: DocumentData) => i.id === item.value.division
    )[0].name;
  } else {
    throw "Division Missing";
  }

  // if paymentType is Allowance, delete total and description and set
  // unset meal types to false
  if (item.value.paymentType === "Allowance") {
    defaults(item.value, {
      breakfast: false,
      lunch: false,
      dinner: false,
      lodging: false,
    });
    delete item.value.description;
    delete item.value.total;
  }

  // TODO: catch the above throw and notify the user.
  // TODO: build more validation here to notify the user of errors
  // before hitting the backend.

  // If there's an attachment, upload it. If successful
  // complete the rest. Otherwise cleanup and abort.
  let uploadFailed = false;
  if (newAttachment !== null) {
    startTask({
      id: `upload${newAttachment}`,
      message: "uploading",
    });

    // upload the attachment
    try {
      await uploadBytes(storageRef(storage, newAttachment), localFile);
      uploadFailed = false;
      endTask(`upload${newAttachment}`);
    } catch (error) {
      endTask(`upload${newAttachment}`);
      alert(`Attachment Upload failed: ${error}`);
      uploadFailed = true;
    }
  }

  // Create or edit the document
  if (!uploadFailed) {
    const currentDoc = props.id
      ? doc(expenses, props.id)
      : doc(expenses);

    try {
      if (newAttachment !== null) {
        // a new attachment was successfully uploaded, save in document
        item.value.attachment = newAttachment;
      }
      await setDoc(currentDoc, item.value);
      router.push(parentPath.value);
    } catch (error) {
      const err = error as FirestoreError;
      alert(`Failed to edit Expense Entry: ${err.message}`);
    }
  } else {
    alert("Uploading the attachment failed");
  }
};

cleanup();
setItem(props.id);
</script>
<style>
.checkoption {
  border-radius: 0.2em;
  background-color: rgb(240, 228, 255);
  padding-left: 0.2em;
  margin-right: 0.2em;
}
</style>
