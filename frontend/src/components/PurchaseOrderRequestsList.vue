<!--
This displays a list of purchase order requests meeting one or more of the
following criteria.
1. The createdUid property matches that of the user. The user is viewing their
   own purchase order requests and will have the option to cancel them.
2. The managerUid property matches that of the user. The user is viewing
   purchase order requests that they are responsible for approving or rejecting.
   They will have the option to approve or reject them.
3. vpApprovalRequired is true and the user is a VP. The user is viewing purchase
   order requests that require VP approval. They will have the option to approve
   or reject them.
4. smgApprovalRequired is true and the user is in the SMG group. The user is
   viewing purchase order requests that require SMG approval. They will have the
   option to approve or reject them.

The the lists are organized as indicated above, with the user's own purchase
order requests first, followed by those that require approval by the user as
specified. Within each group, the purchase order requests are sorted by date in
descending order. There is a listheader for each group, with the text indicating
the group.
-->

<template>
  <reject-modal ref="rejectModal" collectionName="PurchaseOrderRequests" />
  <!-- The lists array, which contains the query and actions for each list. -->
  <template v-for="list in lists">
    <DSList :listHeader="list.header" :query="list.query">
      <template #anchor="item">
        {{ requests ? shortDate(item.createdDate.toDate()) : item.id }}
      </template>
      <template #headline="{ paymentType, total, vendorName, type, endDate }">
        ${{ total }} {{ paymentType }} / {{ vendorName }} 
        <span v-if="type !== 'normal'" class="label">
          <template v-if="type === 'recurring'">recurring until {{ shortDateWithYear(endDate.toDate())  }}</template>
          <template v-else>{{ type }}</template>
        </span>
      </template>
      <template #byline="{ description }">
        {{ description }}
      </template>
      <template #line1="item">
        {{ item.creatorName }} / {{ item.divisionName }} division
        <template v-if="item.attachment">
          <action-button
            type="download"
            @click="downloadAttachment(item)"
          />
        </template>
      </template>
      <template #line2="{ job, jobDescription, client, jobCategory }">
        <template v-if="job !== undefined">
          {{ job }} - {{ client }} {{ jobDescription }} {{ jobCategory ? `(${jobCategory})` : "" }}
        </template>
      </template>
      <template #line3="item">
        <span v-if="item.fullyApproved" class="label">PO # pending...</span>
        <span :class="{ attention: item.rejected }">
          {{ statusLine(item) }}
        </span>
        <span v-if="item.status === 'Cancelled'" class="label">
          cancelled {{ shortDate(item.cancellingDate.toDate()) }} by {{ item.cancellingName }}
        </span>
      </template>
      <template #actions="{ id }">
        <action-button
          v-for="action in list.actions"
          :key="action.type"
          :type="action.type"
          @click="action.handler(id)"
        />
      </template>
    </DSList>
  </template>
</template>

<script setup lang="ts">
import DSList from "./DSList.vue";
import { shortDate, shortDateWithYear, downloadAttachment } from "./helpers";
import { DSListConfig } from "./types";
import { watch, ref } from "vue";
import RejectModal from "./RejectModal.vue";
import ActionButton from "./ActionButton.vue";
import { firebaseApp } from "../firebase";
import { MANAGER_PO_LIMIT, VP_PO_LIMIT } from "../config";
import { getFirestore, collection, query, where, or, and, limit } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useStateStore } from "../stores/state";
import { omit } from "lodash";

const props = defineProps({
  requests: {
    type: Boolean,
    default: true,
  },
  all: {
    // This prop is only used if requests is false. If true, the user will see
    // all purchase orders, not just their own.
    type: Boolean,
    default: false,
  },
});

const rejectModal = ref<typeof RejectModal | null>(null);

const functions = getFunctions(firebaseApp);
const store = useStateStore();
const { user, claims, startTask, endTask } = store;

const purchaseOrders = collection(getFirestore(firebaseApp), "PurchaseOrders");
const purchaseOrderRequests = collection(getFirestore(firebaseApp), "PurchaseOrderRequests");

// Set up the query for purchase order requests that require approval by this
// user. This includes those that require approval by this user as manager, as a
// VP, or as the SMG group.
// First we define a condition that will be modified based on the user's claims
// we use or() so the type of the condition is always
// QueryCompositeFilterConstraint.
let approverRequests = query(purchaseOrderRequests, 
  where("managerUid", "==", user.uid),
  where("managerApprovedDate", "==", null),
);

if (claims.smg === true) {
  // the user is in the SMG group. They will NOT be shown purchase order
  // requests requiring vp approval because that's in the else if block.
  approverRequests = query(purchaseOrderRequests, or(
    and(
      // this user is the manager and has not approved it
      where("managerUid", "==", user.uid),
      where("managerApprovedDate", "==", null),
    ),
    and(
      // requires SMG approval
      where("nextApproverClaim", "==", "smg"),
      where("fullyApproved", "==", false),
    )),
  );
} else if (claims.vp === true) {
  // the user is a VP. Because we use else if, we know they are not in the SMG
  // group.
  approverRequests = query(purchaseOrderRequests, or(
    and(
      // this user is the manager and has not approved it
      where("managerUid", "==", user.uid),
      where("managerApprovedDate", "==", null),
    ),
    and(
      // requires VP approval
      where("nextApproverClaim", "==", "vp"),
      where("fullyApproved", "==", false),
    )),
  );
}

const cancelItem = async function (id: string) {
  startTask({
    id: `cancel${id}`,
    message: "cancelling PO...",
  });
  const cancelPO = httpsCallable(functions, "cancelPurchaseOrder");
  return cancelPO({ id })
    .then(() => {
      endTask(`cancel${id}`);
    })
    .catch((error) => {
      endTask(`cancel${id}`);
      alert(`Error cancelling PO: ${error.message}`);
    });
};

const deleteItem = async function (id: string) {
  startTask({
    id: `delete${id}`,
    message: "deleting PO Request...",
  });
  const delPOR = httpsCallable(functions, "deletePurchaseOrderRequest");
  return delPOR({ id })
    .then(() => {
      endTask(`delete${id}`);
    })
    .catch((error) => {
      endTask(`delete${id}`);
      alert(`Error deleting PO Request: ${error.message}`);
    });
};

const approveItem = async function (id: string) {
  startTask({
    id: `approve${id}`,
    message: "approving PO Request...",
  });
  const approvePOR = httpsCallable(functions, "approvePurchaseOrderRequest");
  return approvePOR({ id })
    .then(() => {
      endTask(`approve${id}`);
    })
    .catch((error) => {
      endTask(`approve${id}`);
      alert(`Error approving PO Request: ${error.message}`);
    });
};

const vpApprovalRequired = function (item: any) {
  // return true if total is greater than or equal to MANAGER_PO_LIMIT, is less
  // than VP_PO_LIMIT, type is not 'recurring' and fullyApproved is false
  return (
    item.total >= MANAGER_PO_LIMIT &&
    item.total < VP_PO_LIMIT &&
    item.type !== "recurring" &&
    item.fullyApproved === false
  );
};

const smgApprovalRequired = function (item: any) {
  // return true if total is greater than or equal to VP_PO_LIMIT and
  // fullyApproved is false
  return (item.total >= VP_PO_LIMIT || item.type === "recurring") && item.fullyApproved === false;
};

const statusLine = function (item: any) {
  const output = [];
  if (item.rejected === true) {
    output.push(`Rejected by ${item.rejectorName}: ${item.rejectionReason}`);
  } else {
    // first include the status of the manager approval
    if(item.managerApprovedDate !== null) {
      output.push(`Approved by ${item.managerName} on ${shortDate(item.managerApprovedDate.toDate())}`);
    } else if (item.managerRejectedDate !== undefined) {
      output.push(`Rejected by ${item.managerName} on ${shortDate(item.managerRejectedDate.toDate())}`);
    } else {
      output.push(`Awaiting approval by ${item.managerName}`);
    }

    // next include the status of the VP approval if required
    if (vpApprovalRequired(item)) {
      if (item.vpUid) {
        output.push(`Approved by ${item.vpName} as VP on ${shortDate(item.vpApprovedDate.toDate())}`);
      } else {
        output.push(`Awaiting VP approval`);
      }
    }

    // next include the status of the SMG approval if required
    if (item.smgUid) {
      output.push(`Approved by ${item.smgName} as SMG on ${shortDate(item.smgApprovedDate.toDate())}`);
    } else if (smgApprovalRequired(item)) {
      output.push(`Awaiting SMG approval`);
    }
  }

  // finally include unused properties
  const unusedProps = omit(item,
    ["total", "description", "createdDate", "creatorUid", "creatorName",
    "job", "jobDescription" , "client", "divisionName", "vendorName",
    "paymentType", "division", "jobCategory", "managerName", "managerUid", 
    "endDate", "attachment", "type", "fullyApproved", "managerApprovedDate", 
    "nextApproverClaim", "vpUid", "vpName", "vpApprovedDate", 
    "poNumberAssignedDate", "smgUid", "smgName", "smgApprovedDate", 
    "rejectorName", "rejectorId", "rejectionReason", "rejected", "status", 
    "cancellingUid", "cancellingDate", "cancellingName" ]
  );
  if (Object.keys(unusedProps).length > 0) {
    output.push(JSON.stringify(unusedProps));
  }
 
  return output.join(" / ");

}

const submitExpense = function () {
  console.log("submitExpense");
};

let lists:DSListConfig[];

// change list being displayed based on props.requests
watch(
  [() => props.requests, () => props.all],
  () => {
    if (props.requests) {
      lists = [
        {
          header: "My Requests",
          query: query(purchaseOrderRequests, where("creatorUid", "==", user.uid)),
          actions: [
            {
              type: "delete",
              handler: deleteItem,
            },
          ],
        },
        {
          header: "Awaiting approval",
          query: approverRequests,
          actions: [
            {
              type: "approve",
              handler: approveItem,
            },
            {
              type: "delete",
              handler: (id: string) => { rejectModal.value?.openModal(id); },
            },
          ],
        },
      ];
    } else {
      lists = [
        {
          header: "My Purchase Orders",
          // if props.all is true, query for all purchase orders, otherwise only
          // those created by the user
          query: props.all ? query(purchaseOrders) : query(purchaseOrders, where("creatorUid", "==", user.uid)),
          actions: [
            {
              type: "add",
              handler: submitExpense,
            },
            {
              type: "delete",
              handler: cancelItem,
            },
          ],
        },
      ];
    }
  },
  { immediate: true }
);

</script>
