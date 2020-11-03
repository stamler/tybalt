import Vue from "vue";
import Router from "vue-router";

// Components
import Main from "@/views/Main.vue";
import Me from "@/components/Me.vue";
import TimeEntries from "@/components/TimeEntries.vue";
import TimeEntriesList from "@/components/TimeEntriesList.vue";
import TimeEntriesEdit from "@/components/TimeEntriesEdit.vue";
import TimeSheets from "@/components/TimeSheets.vue";
import TimeSheetsList from "@/components/TimeSheetsList.vue";
import TimeSheetsDetails from "@/components/TimeSheetsDetails.vue";
import TimeExports from "@/components/TimeExports.vue";
import TimeExportsList from "@/components/TimeExportsList.vue";
import Logins from "@/components/Logins.vue";
import RawLogins from "@/components/RawLogins.vue";
import Computers from "@/components/Computers.vue";
import ComputersList from "@/components/ComputersList.vue";
import ComputersDetails from "@/components/ComputersDetails.vue";
import Users from "@/components/Users.vue";
import UsersList from "@/components/UsersList.vue";
import UsersDetails from "@/components/UsersDetails.vue";
import Profiles from "@/components/Profiles.vue";
import ProfilesList from "@/components/ProfilesList.vue";
import ProfilesEdit from "@/components/ProfilesEdit.vue";
import Projects from "@/components/Projects.vue";
import ProjectsList from "@/components/ProjectsList.vue";
import ProjectsEdit from "@/components/ProjectsEdit.vue";
import Divisions from "@/components/Divisions.vue";
import TimeTypes from "@/components/TimeTypes.vue";
import TimeTypesDivisionsList from "@/components/TimeTypesDivisionsList.vue";
import TimeTypesDivisionsEdit from "@/components/TimeTypesDivisionsEdit.vue";

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
      meta: { claims: ["time"] },
      // TODO: permissions meta (redirect breaks it if placed here)
      redirect: "/time/entries",
      // route level code-splitting
      // this generates a separate chunk (time.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: Main,
      children: [
        {
          path: "entries",
          name: "Time Entries",
          redirect: "/time/entries/list",
          component: TimeEntries,
          children: [
            {
              path: "list",
              name: "Time Entries List",
              component: TimeEntriesList
            },
            {
              path: "add",
              name: "Add Time Entry",
              props: { saveUid: true },
              component: TimeEntriesEdit
            },
            {
              path: ":id/edit",
              // combine static saveUid prop with route-based id
              props: route => ({ id: route.params.id, saveUid: true }),
              name: "Edit Time Entry",
              component: TimeEntriesEdit
            }
          ]
        },
        {
          path: "sheets",
          name: "Time Sheets",
          redirect: "/time/sheets/list",
          component: TimeSheets,
          children: [
            {
              path: "list",
              name: "Time Sheets List",
              component: TimeSheetsList
            },
            {
              path: "pending",
              name: "Time Sheets Pending",
              props: { approved: false },
              component: TimeSheetsList
            },
            {
              path: "approved",
              name: "Time Sheets Approved",
              props: { approved: true },
              component: TimeSheetsList
            },
            {
              path: ":id/details",
              props: true,
              name: "Time Sheet Details",
              component: TimeSheetsDetails
            }
          ]
        },
        {
          path: "exports",
          name: "Time Exports",
          redirect: "/time/exports/list",
          component: TimeExports,
          children: [
            {
              path: "list",
              name: "Time Exports List",
              component: TimeExportsList
            }
          ]
        }
      ]
    },
    {
      path: "/admin",
      name: "Admin",
      redirect: "/admin/logins",
      component: Main,
      children: [
        {
          path: "logins",
          name: "Logins",
          meta: { claims: ["admin"] },
          component: Logins
        },
        {
          path: "rawlogins",
          name: "Raw Logins",
          meta: { claims: ["rawlogins", "audit"] },
          component: RawLogins
        },
        {
          path: "computers",
          name: "Computers",
          meta: { claims: ["computers", "audit"] },
          redirect: "/admin/computers/list",
          component: Computers,
          children: [
            {
              path: "list",
              name: "Computers List",
              // TODO: hide select/edit/del for read-only claims holders
              props: { select: true, edit: true, del: true },
              component: ComputersList
            },
            {
              path: "retired",
              name: "Retired Computers",
              // TODO: hide select/edit/del for read-only claims holders
              props: { select: true, edit: true, del: true, retired: true },
              component: ComputersList
            },
            {
              path: ":id/details",
              props: true,
              name: "Computer Details",
              component: ComputersDetails
            }
          ]
        },
        {
          path: "users",
          name: "Users",
          meta: { claims: ["users", "audit"] },
          redirect: "/admin/users/list",
          component: Users,
          children: [
            {
              path: "list",
              name: "Users List",
              // TODO: hide select/edit/del for read-only claims holders
              props: { select: true, edit: true, del: true },
              component: UsersList
            },
            {
              path: ":id/details",
              props: true,
              name: "User Details",
              component: UsersDetails
            }
          ]
        },
        {
          path: "profiles",
          name: "Profiles",
          redirect: "/admin/profiles/list",
          meta: { claims: ["admin"] },
          component: Profiles,
          children: [
            {
              path: "list",
              name: "Profiles List",
              component: ProfilesList
            },
            {
              path: ":id/edit",
              props: true,
              name: "Edit Profile",
              component: ProfilesEdit
            }
          ]
        },
        {
          path: "projects",
          name: "Projects",
          // TODO: permissions meta (redirect breaks it if placed here)
          redirect: "/admin/projects/list",
          component: Projects,
          children: [
            {
              path: "list",
              name: "Projects List",
              // TODO: hide select/edit/del for read-only claims holders
              props: { select: true, edit: true, del: true },
              component: ProjectsList
            },
            {
              path: "add",
              name: "Add Project",
              component: ProjectsEdit
            },
            {
              path: ":id/edit",
              props: true,
              name: "Edit Project",
              component: ProjectsEdit
            }
          ]
        },
        {
          path: "divisions",
          name: "Divisions",
          redirect: "/admin/divisions/list",
          component: Divisions,
          children: [
            {
              path: "list",
              name: "Divisions List",
              // TODO: hide select/edit/del for read-only claims holders
              props: { edit: true },
              component: TimeTypesDivisionsList
            },
            {
              path: "add",
              name: "Add Division",
              component: TimeTypesDivisionsEdit
            },
            {
              path: ":id/edit",
              props: true,
              name: "Edit Division",
              component: TimeTypesDivisionsEdit
            }
          ]
        },
        {
          path: "timetypes",
          name: "Time Types",
          redirect: "/admin/timetypes/list",
          component: TimeTypes,
          children: [
            {
              path: "list",
              name: "Time Types List",
              // TODO: hide select/edit/del for read-only claims holders
              props: { edit: true },
              component: TimeTypesDivisionsList
            },
            {
              path: "add",
              name: "Add Time Type",
              component: TimeTypesDivisionsEdit
            },
            {
              path: ":id/edit",
              props: true,
              name: "Edit Time Type",
              component: TimeTypesDivisionsEdit
            }
          ]
        }
      ]
    },
    {
      path: "*",
      component: { template: "<h1>404</h1>" }
    }
  ]
});

/*
// Disable route locking for testing purposes
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
      // allow route if at least one element in array is true
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
*/

export default router;
