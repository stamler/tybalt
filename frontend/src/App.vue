<template>
  <div id="app">
    <NavBar />
    <router-view />
  </div>
</template>

<script>
// @ is an alias to /src
import NavBar from "@/components/NavBar.vue";

export default {
  components: {
    NavBar
  },
  data() {
    return {
      user: null
    };
  }
};
</script>

<style>
body {
  margin: 0px;
  padding: 0px;
}

.attention {
  color: red;
}

#app {
  font-size: 20px;
  font-family: "Avenir", Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.nav {
  display: flex;
  font-size: 0.8em;
  /* https://iamsteve.me/blog/entry/using-flexbox-for-horizontal-scrolling-navigation */
  flex-wrap: nowrap;
  overflow-x: auto;
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
.nav .link,
.nav a {
  margin-right: 1em;
  font-weight: bold;
  color: white;
  text-decoration: none;
}
.nav a:hover {
  text-decoration: underline;
}
.nav a.router-link-exact-active {
  color: yellow;
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
  margin: 0em;
  padding: 0em;
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
  margin: 0;
  padding: 0;
}

#list input {
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

#list input:focus,
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
