<template>
  <div>
    <div class="actions">
      <router-link class="navlink" v-bind:to="{ name: 'Users List' }">
        List
      </router-link>
    </div>
    <router-view />
  </div>
</template>
