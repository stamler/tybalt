<template>
  <DSList
    v-if="itemsQuery !== null"
    :query="itemsQuery"
    :search="true"
    class="lwrapper"
  >
    <template #anchor="item">
      <router-link :to="[parentPath, item.id, 'details'].join('/')">
        {{ item.givenName }} {{ item.surname }}
      </router-link>
    </template>
    <template #headline="{ email }">{{ email }}</template>
    <template #byline="item">
      <span v-if="item.updated">
        {{ relativeTime(item.updated) }}
      </span>
      <span v-if="item.addedWithoutComputerLogin">
        no logins, added
        {{ relativeTime(item.addedWithoutComputerLogin) }}
      </span>
    </template>
    <template #line1="{ userSourceAnchor }">{{ userSourceAnchor }}</template>
    <template #line2="item">{{ item.upn }} @ {{ item.lastComputer }}</template>
    <template #line3="{ created }">
      {{ created ? "first seen " + dateFormat(created.toDate()) : "" }}
    </template>
    <template #actions="item">
      <template v-if="item.isInOnPremisesAD === true">
        <template v-if="item.OU === 'Human Users'">
          <router-link
            v-if="item.currentMutationVerb !== 'edit'"
            v-bind:to="{
              name: 'Edit User',
              params: { id: item.id },
            }"
            title="Edit the user"
          >
            <Icon icon="feather:edit" width="24px" />
          </router-link>
          <action-button
            v-if="
              (item.adEnabled === true || item.OU === 'Human Users') &&
              item.currentMutationVerb !== 'archive'
            "
            type="archive"
            @click="editUser('archive', item)"
            title="Disable and archive the user"
          />
          <action-button
            v-if="
              item.adEnabled === true && item.currentMutationVerb !== 'reset'
            "
            type="key"
            @click="editUser('reset', item)"
            title="Reset the user's password and unlock account"
          />
        </template>
        <template v-if="item.OU === 'Disabled Users'">Disabled</template>
        <div
          style="width: 13em"
          v-if="item.OU === 'DisabledUsersSharedMailbox'"
        >
          Disabled w/Shared Mailbox
        </div>
      </template>
    </template>
  </DSList>
</template>

<script setup lang="ts">
import DSList from "./DSList.vue";
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import { dateFormat, relativeTime } from "./helpers";
import { useStateStore } from "../stores/state";
import ActionButton from "./ActionButton.vue";
import { Icon } from "@iconify/vue";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  Query,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

const functions = getFunctions(firebaseApp);

const store = useStateStore();
const { startTask, endTask } = store;
const props = defineProps({
  content: {
    type: String,
    required: true,
  },
});
const itemsQuery = ref(null as Query | null);
const route = useRoute();
const parentPath = ref(route?.matched[route.matched.length - 2]?.path ?? "");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const editUser = async function (verb: string, user: any) {
  startTask({
    id: `${verb}User${user.id}`,
    message: "Creating Mutation...",
  });
  const addMutation = httpsCallable(functions, "addMutation");
  return addMutation({ verb, userId: user.id })
    .then(() => {
      endTask(`${verb}User${user.id}`);
    })
    .catch((error) => {
      endTask(`${verb}User${user.id}`);
      alert(`Error creating mutation: ${error.message}`);
    });
};

watch(
  () => props.content,
  (content) => {
    const collectionObject = collection(getFirestore(firebaseApp), "Users");
    if (content === "all") {
      // show all users
      itemsQuery.value = collectionObject;
    } else if (content === "ad") {
      // show users that exist in active directory
      itemsQuery.value = query(
        collectionObject,
        where("isInOnPremisesAD", "==", true),
        orderBy("surname", "asc"),
        orderBy("givenName", "asc")
      );
    } else if (content === "noad") {
      // show users that do not exist in active directory
      itemsQuery.value = query(
        collectionObject,
        where("isInOnPremisesAD", "==", false),
        orderBy("surname", "asc"),
        orderBy("givenName", "asc")
      );
    }
  },
  { immediate: true }
);
</script>
<style scoped>
.lwrapper :deep(.anchorbox) {
  flex-basis: 6.8em;
}
</style>
