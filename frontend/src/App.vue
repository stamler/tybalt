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

#app {
  font-family: "Avenir", Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: left;
  color: #2c3e50;
}

#nav {
  color: white;
  background-color: #444440;
  padding: 4px 10px 4px;
}

#nav a {
  font-weight: bold;
  color:white;
  text-decoration: none;
}

#nav a:hover {
  text-decoration: underline;
}

#nav a.router-link-exact-active {
  color: yellow;
}

</style>
