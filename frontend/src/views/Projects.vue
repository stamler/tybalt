<template>
  <div id="container">
    <div>
      <input type="textbox" placeholder="search..." v-model="search" />
      <button>New Project</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>{{ processedItems.length }}</th>
          <th><a href="#" v-on:click="sort('job')">Job</a></th>
          <th><a href="#" v-on:click="sort('manager')">Project Manager</a></th>
          <th><a href="#" v-on:click="sort('client')">Client</a></th>
          <th><a href="#" v-on:click="sort('proposal')">Proposal</a></th>
          <th>Description</th>
          <th><a href="#" v-on:click="sort('status')">Status</a></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in processedItems" v-bind:key="item.id">
          <td></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
const items = db.collection("Projects");
import componentMaker from "../components/shared.js";

const component = componentMaker(items);

export default component;
</script>

<style scoped>
#container {
  text-align: left;
}
</style>