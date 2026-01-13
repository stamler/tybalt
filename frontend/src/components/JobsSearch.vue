<template>
  <div id="list" v-if="searchClientLoaded">
    <div v-if="!jobsEnabled" class="disabled-notice">
      <p>
        Job creation and editing has been moved to 
        <a href="https://turbo.tbte.ca/admin/jobs" target="_blank">tybalt turbo</a>.
        You can still view job details below, but please use turbo to create or edit jobs.
      </p>
    </div>
    <ais-instant-search
      v-bind:search-client="searchClient"
      index-name="tybalt_jobs"
    >
      <div id="listbar">
        <ais-search-box
          style="width: 100%; padding-left: 0.3em"
          placeholder="search..."
        />
        <span>{{ count }} items</span>
      </div>

      <ais-hits>
        <template v-slot:item="{ item }">
          <div class="listentry">
            <div class="anchorbox">
              <router-link
                :to="[parentPath, item.objectID, 'details'].join('/')"
              >
                {{ item.objectID }}
              </router-link>
            </div>
            <div class="detailsbox">
              <div class="headline_wrapper">
                <div class="headline">{{ item.client }}</div>
                <div class="byline">{{ item.description }}</div>
              </div>
              <div class="firstline">
                {{ item.managerDisplayName }}
                <span v-if="item.alternateManagerUid">
                  / {{ item.alternateManagerDisplayName }}
                </span>
                <span
                  v-if="item.manager && item.managerUid === undefined"
                  class="attention"
                >
                  ({{ item.manager }})
                </span>
              </div>
              <div class="secondline">
                {{ item.proposal }} {{ item.status }}
              </div>
              <div v-if="item.clientContact" class="thirdline">
                Contact: {{ item.clientContact }}
              </div>
            </div>
            <div class="rowactionsbox" v-if="jobsEnabled">
              <router-link :to="[parentPath, item.objectID, 'edit'].join('/')">
                <Icon icon="feather:edit" width="24px" />
              </router-link>
              <action-button
                type="delete"
                @click="deleteJob({ id: item.objectID })"
              />
            </div>
          </div>
        </template>
      </ais-hits>
    </ais-instant-search>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { firebaseApp } from "../firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useStateStore } from "../stores/state";
import { Icon } from "@iconify/vue";
import algoliasearch from "algoliasearch/lite";
import { SearchClient } from "algoliasearch/lite";
import ActionButton from "./ActionButton.vue";
import {
  getCountFromServer,
  getFirestore,
  collection,
  DocumentData,
  doc,
  getDoc,
} from "firebase/firestore";
const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp);
export default defineComponent({
  setup() {
    const store = useStateStore();
    const { startTask, endTask } = store;
    return { user: store.user, startTask, endTask, jobsEnabled: store.jobsEnabled };
  },

  components: {
    Icon,
    ActionButton,
  },
  data() {
    return {
      count: 0,
      parentPath: "",
      profileSecrets: {} as DocumentData,
      searchClient: {} as SearchClient,
      searchClientLoaded: false,
    };
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
    this.setupSearch();
    getCountFromServer(collection(db, "Jobs")).then((snap) => {
      this.count = snap.data().count;
    });
  },
  methods: {
    async setupSearch() {
      this.profileSecrets = await getDoc(
        doc(db, "ProfileSecrets", this.user.uid)
      );
      const searchkey = this.profileSecrets.get("algoliaSearchKey");
      this.searchClient = algoliasearch("F7IPMZB3IW", searchkey);
      this.searchClientLoaded = true;
    },
    deleteJob(job: DocumentData) {
      this.startTask({
        id: `delete${job.id}`,
        message: "Deleting Job...",
      });
      // call the callable function to delete the job
      const deleteJob = httpsCallable(functions, "deleteJob");
      if (
        confirm("It is is potentially dangerous to delete a job. Are you sure?")
      ) {
        deleteJob(job)
          .then(() => this.endTask(`delete${job.id}`))
          .catch((error) => {
            this.endTask(`delete${job.id}`);
            alert(error.message);
          });
      } else {
        this.endTask(`delete${job.id}`);
      }
    },
  },
});
</script>
<style>
.ais-Hits-list {
  list-style: none;
}
.ais-SearchBox-form {
  display: flex;
}
.ais-SearchBox-input {
  flex: 1;
  border: none;
  order: 2;
}
.ais-SearchBox-submit {
  order: 1;
}
button.ais-SearchBox-submit {
  display: none;
  background: none;
}
.ais-SearchBox-reset {
  order: 3;
}
.anchorbox {
  flex-basis: 6em;
}

.disabled-notice {
  background-color: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 4px;
  padding: 1em;
  margin-bottom: 1em;
}

.disabled-notice p {
  margin: 0;
}

.disabled-notice a {
  color: #0066cc;
  font-weight: bold;
}
</style>
