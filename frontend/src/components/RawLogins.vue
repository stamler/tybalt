<template>
  <div id="container">
    <div>
      <input type="textbox" placeholder="search..." v-model="search" />
      <button v-if="claims.rawlogins === true" v-on:click="deleteSelected()">
        Delete {{ selected.length }} items
      </button>
    </div>
    <table>
      <thead>
        <tr>
          <th>
            <input type="checkbox" v-model="selectAll" v-on:click="toggleAll()">
            {{ selected.length }}/{{ processedItems.length }}
          </th>
          <th><a href="#" v-on:click="sort('mfg')">mfg</a></th>
          <th><a href="#" v-on:click="sort('model')">model</a></th>
          <th><a href="#" v-on:click="sort('upn')">upn</a></th>
          <th><a href="#" v-on:click="sort('serial')">serial</a></th>
          <th>dnsHostname</th>
          <th><a href="#" v-on:click="sort('created')">created</a></th>
          <th>issues</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in processedItems" v-bind:key="item.id">
          <td>
            <input type="checkbox" v-bind:value="item.id" v-model="selected"/>
          </td>
          <td>{{ item.mfg }}</td>
          <td>{{ item.model }}</td>
          <td>{{ item.upn }}</td>
          <td>{{ item.serial }}</td>
          <td>{{ item.networkConfig[Object.keys(item.networkConfig)[0]].dnsHostname }}</td>
          <!-- The below line tests for non-null. There should be no nulls. not sure why this is happening. Promises? -->
          <td>{{ item.created.toDate() | relativeTime }}</td>
          <td>
            <span v-if="!item.userSourceAnchor">userSourceAnchor</span>
            <span v-if="!item.serial">serial {{ guessSerial(item.networkConfig[Object.keys(item.networkConfig)[0]].dnsHostname)}}</span>
            <span v-if="isNaN(item.radiatorVersion)">radiatorVersion</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import componentMaker from "./shared.js";

const component = componentMaker();
const methods = {
  guessSerial(dnsHostname) {
    try {
      return dnsHostname.split("-")[1] || "";
    } catch (error) {
      return "";
    }
  }
};

Object.assign(component.methods, methods);

component.created = function() {
  this.collection = db.collection("RawLogins");
  this.$bind("items", db.collection("RawLogins"));
}

export default component;
</script>

<style scoped>
#container {
  text-align: left;
}
</style>
