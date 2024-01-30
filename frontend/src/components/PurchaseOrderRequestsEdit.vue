<template>
  <form id="editor">
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
        <option value="OnAccount">On Account</option>
        <option value="CorporateCreditCard">Corp Visa</option>
        <option value="Expense">Expense</option>
      </select>
    </span>
    <span class="field">
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
    <span class="field">
      <input type="radio" id="normal" value="normal" v-model="item.type" />
      <label for="normal">Normal</label>

      <input type="radio" id="cumulative" value="cumulative" v-model="item.type" />
      <label for="cumulative">Cumulative</label>

      <input type="radio" id="recurring" value="recurring" v-model="item.type" />
      <label for="recurring">Recurring</label>
    </span>
    <span v-if="item.type === 'cumulative'" class="label">The PO will remain valid until the total is reached</span>
    <span v-if="item.type === 'recurring'" class="label">
      <datepicker
        name="end"
        placeholder="End Date"
        :auto-apply="true"
        :min-date="dps.disabled.to"
        :enable-time-picker="false"
        :format="shortDateWithWeekday"
        week-start="0"
        hide-input-icon
        input-class-name="field"
        v-model="item.endDate"
      />
      Multiple expenses, each up to total, may be submitted against the PO until the end date
    </span>
    <span class="field">
      <label for="vendorName">Vendor Name</label>
      <input
        class="grow"
        type="text"
        name="vendorName"
        v-model.trim="item.vendorName"
        placeholder="Acme Co."
      />
    </span>

    <DSJobSelector v-model="item" @change-job="updateManager" />

    <span class="field" v-if="item.job === undefined">
      <label for="manager">Manager</label>
      <select class="grow" name="manager" v-model="item.managerUid">
        <option v-for="m in managers" :value="m.id" v-bind:key="m.id">
          {{ m.displayName }}
        </option>
      </select>
    </span>

    <span class="field">
      <input
        class="grow"
        type="text"
        name="description"
        placeholder="Purchase Order Description (4 char minimum)"
        v-model.trim="item.description"
      />
    </span>
    <span>
      You may upload a single document to support your PO request such as a PDF
      containing of all of the quotes you received.
    </span>
    <span class="field">
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

    <span class="field">
      <button type="button" v-if="validItem" v-on:click="save()">Save</button>
      <button type="button" v-on:click="$router.push(parentPath)">
        Cancel
      </button>
    </span>
  </form>
</template>

<script setup lang="ts">
import DSJobSelector from "./DSJobSelector.vue";
import { computed, watch, ref } from "vue";
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
import { pickBy } from "lodash";
import { sha256 } from "js-sha256";
import ActionButton from "./ActionButton.vue";
import { downloadAttachment, shortDateWithWeekday } from "./helpers";

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
const { user, startTask, endTask } = store;

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
    to: addWeeks(new Date(), 1),
  },
};

const purchaseOrderRequests = collection(db, "PurchaseOrderRequests");
const divisions = useCollection(collection(db, "Divisions"));
const managers = useCollection(collection(db, "ManagerNames"));
const profileDoc = useDocument<Profile>(doc(db, "Profiles", user.uid));


let item = ref({} as DocumentData);
let newAttachment: string | null = null;
let attachmentPreviouslyUploaded = false;
let localFile = {} as File;
let validAttachmentType = true;

const validItem = computed(() => {
  // TODO: build out client-side validation
  const validVendor =
    (typeof item.value.vendorName === "string" &&
      item.value.vendorName.length > 2);
  const validDescription =
    (typeof item.value.description === "string" &&
      item.value.description.length > 3);
  const validTotal =
    (typeof item.value.total === "number" && item.value.total > 0);
  return (
    validTotal &&
    validDescription &&
    validVendor &&
    !attachmentPreviouslyUploaded &&
    validAttachmentType
  );
});

watch(
  () => props.id,
  (id) => {
    setItem(id);
  }
);

const updateManager = function (values: any) {
  // if the job is undefined, the managerUid is set by the user
  if (item.value.job === undefined) {
    item.value.managerUid = profileDoc.value?.managerUid;
    item.value.managerName = profileDoc.value?.managerName;
    return;
  }
  // otherwise, set the manager from the job
  item.value.managerUid = values.managerUid;
  item.value.managerName = values.managerDisplayName;
};

const cleanup = async function () {
  // clean up any existing orphaned attachments
  const cleanup = httpsCallable(
    functions,
    "cleanUpUsersPurchaseOrderRequestAttachments"
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
          "PurchaseOrderRequests",
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
  if (id) {
    getDoc(doc(purchaseOrderRequests, id))
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
    profileDoc.promise.value.then((profile) => {
      if (!profile) {
        alert("Can't load profile");
        return;
      }
      item.value = {
        managerName: profile.managerName,
        managerUid: profile.managerUid,
        division: profile.defaultDivision,
        type: "normal",
        paymentType: "OnAccount",
      };
    });
  }
};
const save = async function() {
  startTask({
    id: "savePOR",
    message: "saving...",
  });

  if (attachmentPreviouslyUploaded === true) {
    endTask("savePOR");
    throw "You cannot upload a proof of expense twice";
  }
  // TODO: restrict uploading twice in the backend

  item.value = pickBy(item.value, (i) => i !== ""); // strip blank fields
  delete item.value.rejected;
  delete item.value.rejectorId;
  delete item.value.rejectorName;
  delete item.value.rejectionReason;

  // division must be present
  if (item.value.division && item.value.division.length > 0) {
    // write divisionName
    item.value.divisionName = divisions.value.filter(
      (i: DocumentData) => i.id === item.value.division
    )[0].name;
  } else {
    endTask("savePOR");
    throw "Division Missing";
  }

  // write managerName if setJob was not called
  if (item.value.job === undefined) {
    item.value.managerName = managers.value.filter(
      (i: DocumentData) => i.id === item.value.managerUid
    )[0].displayName;
  }

  // if type is recurring, serialize the endDate to a number
  if (item.value.type === "recurring") {
    item.value.endDate = item.value.endDate.getTime();
  }

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
      ? doc(purchaseOrderRequests, props.id)
      : doc(purchaseOrderRequests);

    try {
      if (newAttachment !== null) {
        // a new attachment was successfully uploaded, save in document
        item.value.attachment = newAttachment;
      }
      // call the backend function to save the document
      const createPurchaseOrderRequest = httpsCallable(
        functions,
        "createPurchaseOrderRequest"
      );
      createPurchaseOrderRequest(item.value)
        .then(() => {
          endTask("savePOR");
          router.push(parentPath.value);
        })
        .catch((error: unknown) => {
          console.log(item);
          endTask("savePOR");
          if (error instanceof Error) {
            alert(`Error saving Purchase Order Request: ${error.message}`);
          } else alert(`Error saving Purchase Order Request: ${JSON.stringify(error)}`);
        });
    } catch (error) {
      console.log(item);
      endTask("savePOR");
      const err = error as FirestoreError;
      alert(`Failed to edit PO Request: ${err.message}`);
    }
  } else {
    alert("Uploading the attachment failed");
  }
};

cleanup();
setItem(props.id);
</script>
