<template>
  <div id="container">
    <div>
      <input type="textbox" placeholder="search..." v-model="search" />
    </div>
    <table>
      <thead>
        <tr>
          <th>{{ processedItems.length }}</th>
          <th><a href="#" v-on:click="sort('givenName')">First</a>&nbsp;<a href="#" v-on:click="sort('surname')">Last</a></th>
          <th><a href="#" v-on:click="sort('updated')">updated</a></th>
          <th><a href="#" v-on:click="sort('userSourceAnchor')">ms-DS-ConsistencyGuid</a></th>
          <th><a href="#" v-on:click="sort('lastComputer')">last computer</a></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in processedItems" v-bind:key="item.id">
          <td></td>
          <td>{{ item.givenName }} {{ item.surname }}</td>
          <td>{{ item.updated.toDate() | relativeTime }}</td>
          <td>{{ item.userSourceAnchor }}</td>
          <td>{{ item.lastComputer }}</td>
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

component.created = function() {
  this.$bind("items", db.collection("Users"));
}

export default component;
</script>
