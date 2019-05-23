<template>
  <div id="container">
    <div>
      <input type="textbox" placeholder="search..." v-model="search" />
      <button>New Entry</button>
      <button>Check Entries</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>{{ processedItems.length }}</th>
          <th><a href="#" v-on:click="sort('date')">Date</a></th>
          <th><a href="#" v-on:click="sort('job')">Job/Proposal</a></th>
          <th><a href="#" v-on:click="sort('code')">Code</a></th>
          <th><a href="#" v-on:click="sort('jobHours')">Job Hours</a></th>
          <th><a href="#" v-on:click="sort('hours')">Hours</a></th>
          <th><a href="#" v-on:click="sort('mealsHours')">Meals Hours</a></th>
          <th><a href="#" v-on:click="sort('workRecord')">Work Record</a></th>
          <th><a href="#" v-on:click="sort('project')">Project</a></th>
          <th><a href="#" v-on:click="sort('description')">Description</a></th>
          <th><a href="#" v-on:click="sort('comments')">Comments</a></th>
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
const items = db.collection("TimeEntries");
import componentMaker from "./shared.js";

const component = componentMaker(items);

export default component;
</script>

<style scoped>
#container {
  text-align: left;
}
</style>
