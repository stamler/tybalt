<template>
  <div id="container">
    <div>
      <input type="textbox" placeholder="search..." v-model="search" />
      <button>Bundle Timesheet 21</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>{{ processedItems.length }}</th>
          <th><a href="#" v-on:click="sort('week')">Week Number</a></th>
          <th><a href="#" v-on:click="sort('status')">Status</a></th>
          <th><a href="#" v-on:click="sort('jobHours')">Job Hours</a></th>
          <th><a href="#" v-on:click="sort('hours')">Non-Job Hours</a></th>
          <th><a href="#" v-on:click="sort('mealsHours')">Meal Hours</a></th>
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
const items = db.collection("TimeSheets");
import componentMaker from "./shared.js";

const component = componentMaker(items);

export default component;
</script>

<style scoped>
#container {
  text-align: left;
}
</style>
