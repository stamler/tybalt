<template>
  <div id="list">
    <input
      id="searchbox"
      type="textbox"
      placeholder="search..."
      v-model="search"
    />
    <div class="listentry" v-for="item in processedItems" v-bind:key="item.id">
      <div class="anchorbox">{{ item.created.toDate() | relativeTime }}</div>
      <div class="detailsbox">
        <div class="headline_wrapper">
          <div class="headline">{{ item.mfg }} {{ item.model }}</div>
          <div class="byline">{{ item.serial }}</div>
        </div>
        <div class="firstline">{{ item.upn }} {{ item.userSourceAnchor }}</div>
        <div class="secondline">
          Hostname
          {{
            item.networkConfig[Object.keys(item.networkConfig)[0]].dnsHostname
          }}
          reported from radiator v{{ item.radiatorVersion }}
        </div>
        <div class="thirdline">
          <span v-if="!item.userSourceAnchor">missing userSourceAnchor</span>
          <span v-if="!item.serial">
            missing serial
            {{
              guessSerial(
                item.networkConfig[Object.keys(item.networkConfig)[0]].dnsHostname
              )
            }}
          </span>
          <span v-if="isNaN(item.radiatorVersion)">
            missing radiatorVersion
          </span>
        </div>
      </div>
      <div class="rowactionsbox">
        <router-link to="#" v-on:click.native="del(item.id)">
          ❌
        </router-link>
      </div>
    </div>
  </div>
</template>

<script>
import moment from "moment";

export default {
  computed: {
    processedItems() {
      return this.items
        .slice() // shallow copy https://github.com/vuejs/vuefire/issues/244
        .filter(
          p => this.searchString(p).indexOf(this.search.toLowerCase()) >= 0
        );
    }
  },
  filters: {
    relativeTime(date) {
      return moment(date).fromNow();
    },
    shortDate(date) {
      return moment(date).format("MMM DD");
    },
    hoursString(item) {
      const hoursArray = [];
      if (item.hours) hoursArray.push(item.hours + " hrs");
      if (item.jobHours) hoursArray.push(item.jobHours + " job hrs");
      if (item.mealsHours) hoursArray.push(item.mealsHours + " hrs meals");
      return hoursArray.join(" + ");
    }
  },
  data() {
    return {
      search: "",
      parentPath: null,
      collection: null, // collection: a reference to the parent collection
      items: []
    };
  },
  created() {
    this.parentPath = this.$route.matched[
      this.$route.matched.length - 1
    ].parent.path;
    this.collection = this.$parent.collection;
    this.items = this.$parent.items;
    this.$bind("items", this.items);
  },
  methods: {
    del(item) {
      this.collection
        .doc(item)
        .delete()
        .catch(err => {
          console.log(err);
        });
    },
    searchString(item) {
      const fields = Object.values(item);
      fields.push(item.id);
      return fields.join(",").toLowerCase();
    },
    guessSerial(dnsHostname) {
      try {
        return dnsHostname.split("-")[1] || "";
      } catch (error) {
        return "";
      }
    }
  }
};
</script>
<style scoped>
.anchorbox {
  width: 7.2em;
}
</style>
