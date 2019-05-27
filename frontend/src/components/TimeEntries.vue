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
          <td>{{ item.date }}</td>
          <td>{{ item.job }}</td>
          <td>{{ item.code }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
import firebase from "@/firebase";
import store from "../store";
const db = firebase.firestore();
import componentMaker from "./shared.js";

const component = componentMaker();
component.created = function() {
  this.$bind("items", db.collection("TimeEntries").where("uid", "==", store.state.user.uid));
}

export default component;
</script>

<style scoped>
#container {
  text-align: left;
}
</style>
