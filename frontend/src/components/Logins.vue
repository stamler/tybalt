<template>
  <div id="container">
    <div>
      <input type="textbox" placeholder="search..." v-model="search" />
    </div>
    <table>
      <thead>
        <tr>
          <th>{{ processedItems.length }}</th>
          <th><a href="#" v-on:click="sort('computer')">Computer</a></th>
          <th><a href="#" v-on:click="sort('givenName')">First</a>&nbsp;<a href="#" v-on:click="sort('surname')">Last</a></th>
          <th><a href="#" v-on:click="sort('created')">created</a></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in processedItems" v-bind:key="item.id">
          <td></td>
          <td>{{ item.computer }}</td>
          <td>{{ item.givenName }} {{ item.surname }}</td>
          <td>{{ item.created.toDate() | relativeTime }}</td>
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
  this.$bind("items", db.collection("Logins").orderBy("created", "desc").limit(101));
}

export default component;
</script>

<style scoped>
#container {
  text-align: left;
}
</style>
