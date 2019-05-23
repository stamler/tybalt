import Vue from "vue";
import Router from "vue-router";
import store from "./store";

// Views
import Dashboard from "@/views/Dashboard.vue";

// Components
import RawLogins from "@/components/RawLogins.vue";
import Logins from "@/components/Logins.vue";
import Profiles from "@/components/Profiles.vue";
import Computers from "@/components/Computers.vue";
import Users from "@/components/Users.vue";

Vue.use(Router);

const router = new Router({
  mode: "history",
  base: process.env.BASE_URL,
  routes: [
    {
      path: "/",
      redirect: "/dashboard"
    },
    {
      path: "/dashboard",
      name: "Dashboard",
      component: Dashboard
    },
    {
      path: "/projects",
      name: "Projects",
      // route level code-splitting
      // this generates a separate chunk (about.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () =>
        import(/* webpackChunkName: "about" */ "./views/Projects.vue")
    },
    {
      path: "/time",
      name: "Time",
      // route level code-splitting
      // this generates a separate chunk (about.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () =>
        import(/* webpackChunkName: "about" */ "./views/Time.vue")
    },
    {
      path: "/about",
      name: "About",
      // route level code-splitting
      // this generates a separate chunk (about.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () =>
        import(/* webpackChunkName: "about" */ "./views/About.vue")
    },
    {
      path: "/admin",
      name: "Admin",
      component: () =>
        import(/* webpackChunkName: "about" */ "./views/Admin.vue"),
      children: [
        {
          path: "rawlogins",
          name: "Raw Logins",
          meta: { claims: ["rawlogins", "audit"] },
          component: RawLogins
        },
        {
          path: "logins",
          name: "Logins",
          meta: { claims: ["logins", "audit"] },
          component: Logins
        },
        {
          path: "profiles",
          name: "Profiles",
          meta: { claims: ["profiles", "audit"] },
          component: Profiles
        },
        {
          path: "computers",
          name: "Computers",
          meta: { claims: ["computers", "audit"] },
          component: Computers
        },
        {
          path: "users",
          name: "Users",
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

router.beforeEach((to, from, next) => {
  if (to.meta && to.meta.claims) {
    // make an array of claims shared by the authed user
    // and the meta claims property
    // TODO: this breaks on manual navigation because state
    // claims haven't been written yet (they're written by a promise)
    const intrsect = to.meta.claims.filter(x =>
      store.state.claims.hasOwnProperty(x)
    );
    if (intrsect.some(x => store.state.claims[x] === true)) {
      // if at least one element in this array has a value of true
      // allow the route
      console.log(`protected route allowed`);
      next();
    } else {
      // otherwise cancel the navigation
      console.log("protected route blocked");
      next(false);
    }
  } else {
    next();
  }
});

export default router;
