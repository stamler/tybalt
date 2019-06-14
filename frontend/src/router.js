import Vue from "vue";
import Router from "vue-router";
import store from "./store";

// Components
import Me from "@/components/Me.vue";

Vue.use(Router);

const router = new Router({
  mode: "history",
  base: process.env.BASE_URL,
  routes: [
    {
      path: "/",
      redirect: "/me"
    },
    {
      path: "/me",
      component: Me
    },
    {
      path: "/time",
      name: "Time",
      // TODO: permissions meta (redirect breaks it if placed here)
      redirect: "/time/entries",
      // route level code-splitting
      // this generates a separate chunk (time.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () =>
        import(/* webpackChunkName: "time" */ "./views/Time.vue"),
      children: [
        {
          path: "entries",
          name: "Time Entries",
          redirect: "/time/entries/list",
          component: () =>
            import(/* webpackChunkName: "time" */ "./components/TimeEntries.vue"),
          children: [
            {
              path: "list",
              name: "Time Entries List",
              // TODO: hide select/edit/del for read-only claims holders
              props: { select: true, edit: true, del: true },
              component: () =>
                import(/* webpackChunkName: "time" */ "./components/List.vue")
            },
            {
              path: "add",
              name: "Add Time Entry",
              props: { saveUid: true },
              component: () =>
                import(/* webpackChunkName: "time" */ "./components/TimeEntriesEdit.vue")
            },
            {
              path: ":id/edit",
              // combine static saveUid prop with route-based id
              props: route => ({ id: route.params.id, saveUid: true }),
              name: "Edit Time Entry",
              component: () =>
                import(/* webpackChunkName: "time" */ "./components/TimeEntriesEdit.vue")
            }
          ]
        },
        {
          path: "sheets",
          name: "Time Sheets",
          component: () =>
            import(/* webpackChunkName: "time" */ "./components/TimeSheets.vue")
        }
      ]
    },
    {
      path: "/admin",
      name: "Admin",
      redirect: "/admin/logins",
      // route level code-splitting
      // this generates a separate chunk (about.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () =>
        import(/* webpackChunkName: "admin" */ "./views/Admin.vue"),
      children: [
        {
          path: "logins",
          name: "Logins",
          meta: { claims: ["logins", "audit"] },
          component: () =>
            import(/* webpackChunkName: "admin" */ "./components/Logins.vue")
        },
        {
          path: "profiles",
          name: "Profiles",
          meta: { claims: ["profiles", "audit"] },
          component: () =>
            import(/* webpackChunkName: "admin" */ "./components/Profiles.vue")
        },
        {
          path: "computers",
          name: "Computers",
          meta: { claims: ["computers", "audit"] },
          component: () =>
            import(/* webpackChunkName: "admin" */ "./components/Computers.vue")
        },
        {
          path: "users",
          name: "Users",
          meta: { claims: ["users", "audit"] },
          component: () =>
            import(/* webpackChunkName: "admin" */ "./components/Users.vue")
        },
        {
          path: "projects",
          name: "Projects",
          // TODO: permissions meta (redirect breaks it if placed here)
          redirect: "/admin/projects/list",
          component: () =>
            import(/* webpackChunkName: "admin" */ "./components/Projects.vue"),
          children: [
            {
              path: "list",
              name: "Projects List",
              // TODO: hide select/edit/del for read-only claims holders
              props: { select: true, edit: true, del: true },
              component: () =>
                import(/* webpackChunkName: "admin" */ "./components/List.vue")
            },
            {
              path: "add",
              name: "Add Project",
              component: () =>
                import(/* webpackChunkName: "admin" */ "./components/Edit.vue")
            },
            {
              path: ":id/edit",
              props: true,
              name: "Edit Project",
              component: () =>
                import(/* webpackChunkName: "admin" */ "./components/Edit.vue")
            }
          ]
        },
        {
          path: "divisions",
          name: "Divisions",
          redirect: "/admin/divisions/list",
          component: () =>
            import(/* webpackChunkName: "admin" */ "./components/Divisions.vue"),
          children: [
            {
              path: "list",
              name: "Divisions List",
              // TODO: hide select/edit/del for read-only claims holders
              props: { edit: true },
              component: () =>
                import(/* webpackChunkName: "admin" */ "./components/List.vue")
            },
            {
              path: "add",
              name: "Add Division",
              component: () =>
                import(/* webpackChunkName: "admin" */ "./components/Edit.vue")
            },
            {
              path: ":id/edit",
              props: true,
              name: "Edit Division",
              component: () =>
                import(/* webpackChunkName: "admin" */ "./components/Edit.vue")
            }
          ]
        },
        {
          path: "timetypes",
          name: "Time Types",
          redirect: "/admin/timetypes/list",
          component: () =>
            import(/* webpackChunkName: "admin" */ "./components/TimeTypes.vue"),
          children: [
            {
              path: "list",
              name: "Time Types List",
              // TODO: hide select/edit/del for read-only claims holders
              props: { edit: true },
              component: () =>
                import(/* webpackChunkName: "admin" */ "./components/List.vue")
            },
            {
              path: "add",
              name: "Add Time Type",
              component: () =>
                import(/* webpackChunkName: "admin" */ "./components/Edit.vue")
            },
            {
              path: ":id/edit",
              props: true,
              name: "Edit Time Type",
              component: () =>
                import(/* webpackChunkName: "admin" */ "./components/Edit.vue")
            }
          ]
        },
        {
          path: "rawlogins",
          name: "Raw Logins",
          meta: { claims: ["rawlogins", "audit"] },
          component: () =>
            import(/* webpackChunkName: "admin" */ "./components/RawLogins.vue")
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
