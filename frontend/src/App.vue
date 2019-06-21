<template>
  <div id="app">
    <SideNav />
    <router-view v-bind:class="{ slidRight: sidenav }" id="main" />
  </div>
</template>

<script>
// @ is an alias to /src
import SideNav from "@/components/SideNav.vue";
import { mapState } from "vuex";

export default {
  components: {
    SideNav
  },
  computed: mapState(["sidenav"]),
  data() {
    return {
      user: null
    };
  }
};
</script>

<style>
* {
  margin: 0;
  padding: 0;
}

html,
body,
#app {
  height: 100vh;
  width: 100vw;
}

.attention {
  color: red;
}

#app {
  /* Flexbox Off Canvas Menu similar to this technique
     https://codepen.io/oknoblich/pen/klnjw */
  /* min-height: 100%; /* is this necessary? */
  display: flex;
  overflow: hidden;
  font-size: 20px;
  font-family: "Avenir", Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#sidenav {
  position: absolute;
  height: 100vh;
  /* https://codepen.io/markcaron/pen/pPZVWO */
  /*transform: translateX(-100%);*/
  color: white;
  width: 10em;
  background-color: #555;
  padding: 1em 0em 0em 1em;
  box-sizing: border-box; /* make padding stay within 100% box */
  display: flex;
  flex-direction: column;
}

#main {
  /* https://stackoverflow.com/questions/1260122/expand-a-div-to-fill-the-remaining-width */
  display: flex;
  flex-direction: column;
  flex: 1;
  background: #fff;
  transform: translate(0);
  transition: transform 0.3s ease-in-out;
  /* allow shrinking of content */
  /* min-width: 0; */
}

#main.slidRight {
  transform: translate(10em);
}

#content {
  flex-direction: column;
  overflow: auto;
}
.nav {
  display: flex;
  font-size: 0.8em;
  /* https://iamsteve.me/blog/entry/using-flexbox-for-horizontal-scrolling-navigation */
  flex-wrap: nowrap;
  overflow-x: auto;
  flex-shrink: 0;
  scrollbar-width: none; /* hide scrollbar firefox (experimental */
  -webkit-overflow-scrolling: touch;
  -ms-overflow-style: -ms-autohiding-scrollbar; /* hide scrollbar edge */
  color: white;
  background-color: #444440;
  padding: 4px 10px 4px;

  /*
  CSS Scrolling shadows?
  https://stackoverflow.com/questions/9333379/check-if-an-elements-content-is-overflowing
  */
}
.nav::-webkit-scrollbar {
  display: none; /* hide scrollbar in safari */
}

#sidenav a,
.nav .link,
.nav a {
  margin-right: 1em;
  font-weight: bold;
  color: white;
  text-decoration: none;
}
#sidenav a:hover,
.nav a:hover {
  text-decoration: underline;
}
#sidenav a.router-link-exact-active,
.nav a.router-link-exact-active {
  color: yellow;
}
#sidenav .linksstart {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
}
#sidenav .linksend {
  margin-top: 1em;
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
}
.nav .linksstart {
  display: flex;
  flex: 0 0 auto;
}
.nav .linksend {
  margin-left: auto;
  flex: 0 0 auto;
}

.listentry {
  display: flex;
  flex-grow: 1;
  font-size: 0.8em;
  height: 5em;
  border-bottom: 1px solid #eee;
}
.anchorbox {
  display: flex;
  flex-shrink: 0;
  margin: 0em 0.6em 0em;
  width: 3.2em;
  align-items: center;
  font-weight: bold;
  font-size: 0.9em;
}
.detailsbox {
  display: flex;
  /* ensure ellipsis works on children 
  https://css-tricks.com/flexbox-truncated-text/ */
  min-width: 0;
  justify-content: center;
  flex-grow: 1;
  flex-direction: column;
}

.headline_wrapper {
  display: flex;
}

.headline,
.byline,
.firstline,
.secondline,
.thirdline {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.9em;
}

.headline {
  font-weight: bold;
}

.byline {
  margin-left: 0.3em;
}

.thirdline {
  color: grey;
}

/* Editor Styles */
#editor {
  display: flex;
  flex-direction: column;
}
#editor .field {
  display: flex;
  font-size: 1.2em;
}

input,
select {
  border-top: none;
  border-left: none;
  border-right: none;
  border-bottom: 1px solid #e6e6e6;
}

#content input {
  width: 100%;
  font-size: 1.25em;
}

#editor .calendar-input,
#editor .field input,
#editor .field select {
  flex-grow: 1;
  font-size: 1em;
  -moz-appearance: none;
  -webkit-appearance: none;
}

#content input:focus,
#editor .field select:focus,
#editor .field input:focus {
  outline: none;
}
#editor .field label {
  flex-shrink: 0;
  font-size: 1em;
  padding-right: 0.3em;
}
#editor .calendar-input,
#editor .calendar-wrapper {
  width: 100%;
}
</style>
