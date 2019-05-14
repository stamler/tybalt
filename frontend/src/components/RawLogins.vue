<template>
  <div id="container">
    <div>
      <input type="textbox" placeholder="search..." />
      <button v-on:click="deleteSelected()">Delete {{ selected.length }} items</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>
            <input type="checkbox" v-model="selectAll" v-on:click="toggleAll()">
            {{ selected.length }}/{{ items.length }} 
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
          <input type="checkbox" v-bind:value="item.id" v-model="selected">
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
const items = db.collection("RawLogins");
import componentMaker from "./shared.js";

const component = componentMaker(items);
const methods = {
  guessSerial(dnsHostname) {
    try {
      return dnsHostname.split("-")[1] || "";      
    } catch (error) {
      return "";
    }
  },
  deleteSelected() {
    const batch = db.batch(); 
    this.selected.forEach((key) => {
      batch.delete(items.doc(key));
    });
    batch.commit()
    .then(() => {
      this.selected = [];
      this.selectAll = false;
    })
    .catch((err) => {
      console.log(`Batch failed: ${err}`)
    })
  }
};

Object.assign(component.methods, methods);

export default component;
</script>

<style scoped>
#container {
  text-align: left;
}
</style>
