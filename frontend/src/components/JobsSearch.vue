<template>
  <div id="list" v-if="searchClientLoaded">
    <ais-instant-search
      v-bind:search-client="searchClient"
      index-name="tybalt_jobs"
    >
      <ais-search-box id="searchbox" placeholder="search..." />
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
            <div class="rowactionsbox">
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
import firebase from "../firebase";
const db = firebase.firestore();
import { useStateStore } from "../stores/state";
import { Icon } from "@iconify/vue";
import algoliasearch from "algoliasearch/lite";
import { SearchClient } from "algoliasearch/lite";
import ActionButton from "./ActionButton.vue";

export default defineComponent({
  setup() {
    const store = useStateStore();
    const { startTask, endTask } = store;
    return { user: store.user, startTask, endTask };
  },

  components: {
    Icon,
    ActionButton,
  },
  data() {
    return {
      parentPath: "",
      profileSecrets: {} as firebase.firestore.DocumentData,
      searchClient: {} as SearchClient,
      searchClientLoaded: false,
    };
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
    this.setup();
  },
  methods: {
    async setup() {
      this.profileSecrets = await db
        .collection("ProfileSecrets")
        .doc(this.user.uid)
        .get();
      const searchkey = this.profileSecrets.get("algoliaSearchKey");
      this.searchClient = algoliasearch("F7IPMZB3IW", searchkey);
      this.searchClientLoaded = true;
    },
    deleteJob(job: firebase.firestore.DocumentData) {
      this.startTask({
        id: `delete${job.id}`,
        message: "Deleting Job...",
      });
      // call the callable function to delete the job
      const deleteJob = firebase.functions().httpsCallable("deleteJob");
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
</style>
