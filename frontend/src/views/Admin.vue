<template>
  <div>
    <h1>Administration</h1>
    <div id="nav">
      <router-link to="/admin/rawlogins">Raw Logins</router-link> |
      <router-link to="/admin/logins">Logins</router-link> |
      <router-link to="/admin/profiles">Profiles</router-link> |
      <router-link to="/admin/computers">Computers</router-link>
    </div>
    <router-view/>
  </div>
</template>
<style>
#nav {
  padding: 30px;
}

#nav a {
  font-weight: bold;
  color: #2c3e50;
}

#nav a.router-link-exact-active {
  color: #42b983;
}

</style>
