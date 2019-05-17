<template>
  <div id="container">
    <div>
      <input type="textbox" placeholder="search..." v-model="search" />
    </div>
    <table>
      <thead>
        <tr>
          <th>{{ items.length }}</th>
          <th><a href="#" v-on:click="sort('computerName')">Computer</a></th>
          <th><a href="#" v-on:click="sort('osVersion')">Windows</a></th>
          <th><a href="#" v-on:click="sort('mfg')">mfg</a></th>
          <th><a href="#" v-on:click="sort('model')">model</a></th>
          <th><a href="#" v-on:click="sort('userGivenName')">First</a>&nbsp;<a href="#" v-on:click="sort('userSurname')">Last</a></th>
          <th>assigned</th>
          <th><a href="#" v-on:click="sort('updated')">updated</a></th>
          <th><a href="#" v-on:click="sort('created')">created</a></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in processedItems" v-bind:key="item.id">
          <td></td>
          <td>
            <span v-if="!item.computerName.includes(item.serial)">❗({{ item.serial }})</span>
            <br/>
            {{ item.computerName }}
          </td>
          <td>{{ item.osVersion }}</td>
          <td>{{ item.mfg }}</td>
          <td>{{ item.model }}</td>
          <td>{{ item.userGivenName }} {{ item.userSurname }}</td>
          <td>
            <span v-if="!item.assigned">
              <!-- Show this if the device has no assignment -->
              <button 
                v-if="claims.computers === true"
                v-on:click="assign(item.id, item.userSourceAnchor)">
                assign
              </button>
            </span>
            <span v-else-if="item.assigned.userSourceAnchor !== item.userSourceAnchor">
              <!-- Show this if the device has an assignment that doesn't
              match the last user login -->
              <button 
                v-on:click="assign(item.id, item.userSourceAnchor)">
                ❗assign, currently {{ item.assigned.givenName }} {{ item.assigned.surname }}
              </button>
            </span>
            <span v-else>{{ item.assigned.time.toDate() | relativeTime }}</span>
          </td>
          <td>{{ item.updated.toDate() | relativeTime }}</td>
          <td>{{ item.created.toDate() | dateFormat }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
import firebase from "@/firebase";
import { mapState } from "vuex";
const db = firebase.firestore();
const items = db.collection("Computers");
import componentMaker from "./shared.js";

const component = componentMaker(items);
const methods = {
  assign(computer, user) {
    const assignComputerToUser = firebase.functions().httpsCallable("assignComputerToUser");
    return assignComputerToUser({ computer, user })
    .then((result) => {
      console.log(`assigned computer ${computer} to ${user}`);      
    })
    .catch((error) => {
      console.log(error);
      console.log(`assignComputerTouser(${computer}, ${user}) didn't work`); 
    });
  }
}

const computed = mapState({ claims: state => state.claims });

Object.assign(component.methods, methods);
Object.assign(component.computed, computed);

export default component;
</script>

<style scoped>
#container {
  text-align: left;
}
</style>
