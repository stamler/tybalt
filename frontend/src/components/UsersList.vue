<template>
  <div id="list">
    <div id="listbar">
      <input
        id="searchbox"
        type="textbox"
        placeholder="search..."
        v-model="search"
      />
      <span>{{ processedItems.length }} items</span>
    </div>
    <div class="listentry" v-for="item in processedItems" v-bind:key="item.id">
      <div class="anchorbox">
        <router-link :to="[parentPath, item.id, 'details'].join('/')">
          {{ item.givenName }} {{ item.surname }}
        </router-link>
      </div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">{{ item.email }}</div>
          <div class="byline">
            <span v-if="item.updated">
              {{ relativeTime(item.updated.toDate()) }}
            </span>
            <span v-if="item.addedWithoutComputerLogin">
              no logins, added
              {{ relativeTime(item.addedWithoutComputerLogin.toDate()) }}
            </span>
          </div>
        </div>
        <div class="firstline">
          {{ item.userSourceAnchor }}
        </div>
        <div class="secondline">
          {{ item.upn }} @
          {{ item.lastComputer }}
        </div>
        <div class="thirdline">
          {{
            item.created
              ? "first seen " + dateFormat(item.created.toDate())
              : ""
          }}
        </div>
      </div>
      <div class="rowactionsbox" v-if="item.isInOnPremisesAD === true">
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
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { dateFormat, searchString } from "./helpers";
import { useStateStore } from "../stores/state";
import ActionButton from "./ActionButton.vue";
import { Icon } from "@iconify/vue";
import { formatDistanceToNow } from "date-fns";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  collection,
  DocumentData,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp);

export default defineComponent({
  setup() {
    const store = useStateStore();
    const { startTask, endTask } = store;
    return { startTask, endTask };
  },
  props: ["query"],
  components: {
    ActionButton,
    Icon,
  },
  data() {
    return {
      search: "",
      parentPath: "",
      collectionObject: collection(db, "Users"),
      items: [],
    };
  },
  computed: {
    processedItems(): DocumentData[] {
      return this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .filter(
          (p: DocumentData) =>
            searchString(p).indexOf(this.search.toLowerCase()) >= 0
        );
    },
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
    this.$watch(
      "query",
      () => {
        if (this.query === "list") {
          // show all users
          this.$firestoreBind("items", this.collectionObject).catch(
            (error: unknown) => {
              if (error instanceof Error) {
                alert(`Can't load Users: ${error.message}`);
              } else alert(`Can't load Users: ${JSON.stringify(error)}`);
            }
          );
        } else if (this.query === "ad") {
          // show users that exist in active directory
          this.$firestoreBind(
            "items",
            query(
              this.collectionObject,
              where("isInOnPremisesAD", "==", true),
              orderBy("surname", "asc"),
              orderBy("givenName", "asc")
            )
          ).catch((error: unknown) => {
            if (error instanceof Error) {
              alert(`Can't load Users: ${error.message}`);
            } else alert(`Can't load Users: ${JSON.stringify(error)}`);
          });
        } else if (this.query === "noad") {
          // show users that do not exist in active directory
          this.$firestoreBind(
            "items",
            query(
              this.collectionObject,
              where("isInOnPremisesAD", "==", false),
              orderBy("surname", "asc"),
              orderBy("givenName", "asc")
            )
          ).catch((error: unknown) => {
            if (error instanceof Error) {
              alert(`Can't load Users: ${error.message}`);
            } else alert(`Can't load Users: ${JSON.stringify(error)}`);
          });
        }
      },
      { immediate: true }
    );
  },
  methods: {
    dateFormat,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async editUser(verb: string, user: any) {
      this.startTask({
        id: `${verb}User${user.id}`,
        message: "Creating Mutation...",
      });
      const addMutation = httpsCallable(functions, "addMutation");
      return addMutation({ verb, userId: user.id })
        .then(() => {
          this.endTask(`${verb}User${user.id}`);
        })
        .catch((error) => {
          this.endTask(`${verb}User${user.id}`);
          alert(`Error creating mutation: ${error.message}`);
        });
    },
    relativeTime(date: Date) {
      return formatDistanceToNow(date, { addSuffix: true });
    },
  },
});
</script>
<style scoped>
.anchorbox {
  flex-basis: 6.8em;
}
</style>
