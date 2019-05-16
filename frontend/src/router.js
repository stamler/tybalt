import Vue from "vue";
import Router from "vue-router";

// Views
import Dashboard from "@/views/Dashboard.vue";

// Components
import RawLogins from "@/components/RawLogins.vue";
import Logins from "@/components/Logins.vue";
import Profiles from "@/components/Profiles.vue";
import Computers from "@/components/Computers.vue";
import Users from "@/components/Users.vue";

Vue.use(Router);

export default new Router({
  mode: "history",
  base: process.env.BASE_URL,
  routes: [
    {
      path: "/",
      redirect: "/dashboard"
    },
    {
      path: "/dashboard",
      name: "dashboard",
      component: Dashboard
    },
    {
      path: "/projects",
      name: "projects",
      // route level code-splitting
      // this generates a separate chunk (about.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () =>
        import(/* webpackChunkName: "about" */ "./views/Projects.vue")
    },
    {
      path: "/time",
      name: "time",
      // route level code-splitting
      // this generates a separate chunk (about.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () =>
        import(/* webpackChunkName: "about" */ "./views/Time.vue")
    },
    {
      path: "/about",
      name: "about",
      // route level code-splitting
      // this generates a separate chunk (about.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () =>
        import(/* webpackChunkName: "about" */ "./views/About.vue")
    },
    {
      path: "/admin",
      name: "admin",
      component: () =>
        import(/* webpackChunkName: "about" */ "./views/Admin.vue"),
      children: [
        {
          path: "rawlogins",
          component: RawLogins
        },
        {
          path: "logins",
          component: Logins
        },
        {
          path: "profiles",
          component: Profiles
        },
        {
          path: "computers",
          component: Computers
        },
        {
          path: "users",
          component: Users
        }

      ]
    },
    {
      path: "*",
      component: { template: "<h1>404</h1>" }
    }
  ]
});
