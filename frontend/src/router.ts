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
import TimeTracking from "@/components/TimeTracking.vue";
import TimeTrackingList from "@/components/TimeTrackingList.vue";
import Logins from "@/components/Logins.vue";
import LoginsList from "@/components/LoginsList.vue";
import RawLogins from "@/components/RawLogins.vue";
import RawLoginsList from "@/components/RawLoginsList.vue";
import ContentShell from "@/components/ContentShell.vue";
import ComputersList from "@/components/ComputersList.vue";
import ComputersDetails from "@/components/ComputersDetails.vue";
import Users from "@/components/Users.vue";
import UsersList from "@/components/UsersList.vue";
import UsersDetails from "@/components/UsersDetails.vue";
import Profiles from "@/components/Profiles.vue";
import ProfilesList from "@/components/ProfilesList.vue";
import ProfilesEdit from "@/components/ProfilesEdit.vue";
import Jobs from "@/components/Jobs.vue";
import JobsList from "@/components/JobsList.vue";
import JobsEdit from "@/components/JobsEdit.vue";
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
      redirect: "/time/entries",
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
              props: { collection: "TimeEntries" },
              component: TimeEntriesList
            },
            {
              path: "add",
              name: "Add Time Entry",
              props: { collection: "TimeEntries" },
              component: TimeEntriesEdit
            },
            {
              path: ":id/edit",
              props: route => {
                return { id: route.params.id, collection: "TimeEntries" };
              },
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
              props: { collection: "TimeSheets" },
              component: TimeSheetsList
            },
            {
              path: "pending",
              name: "Time Sheets Pending",
              props: { approved: false, collection: "TimeSheets" },
              component: TimeSheetsList
            },
            {
              path: "approved",
              name: "Time Sheets Approved",
              props: { approved: true, collection: "TimeSheets" },
              component: TimeSheetsList
            },
            {
              path: ":id/details",
              props: route => {
                return { id: route.params.id, collection: "TimeSheets" };
              },
              name: "Time Sheet Details",
              component: TimeSheetsDetails
            }
          ]
        },
        {
          path: "tracking",
          name: "Time Tracking",
          redirect: "/time/tracking/list",
          component: TimeTracking,
          children: [
            {
              path: "list",
              name: "Time Tracking List",
              props: { collection: "TimeTracking" },
              component: TimeTrackingList
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
          redirect: "/admin/logins/list",
          component: Logins,
          children: [
            {
              path: "list",
              name: "Logins List",
              props: { collection: "Logins" },
              component: LoginsList
            }
          ]
        },
        {
          path: "rawlogins",
          name: "Raw Logins",
          meta: { claims: ["rawlogins", "audit"] },
          redirect: "/admin/rawlogins/list",
          component: RawLogins,
          children: [
            {
              path: "list",
              name: "Raw Logins List",
              props: { collection: "RawLogins" },
              component: RawLoginsList
            }
          ]
        },
        {
          path: "computers",
          name: "Computers",
          meta: { claims: ["computers", "audit"] },
          redirect: "/admin/computers/list",
          component: ContentShell,
          children: [
            {
              meta: { showInUi: true, uiName: "List" },
              path: "list",
              name: "Computers List",
              props: { collection: "Computers" },
              component: ComputersList
            },
            {
              meta: { showInUi: true, uiName: "Retired" },
              path: "retired",
              name: "Retired Computers",
              props: { collection: "Computers", retired: true },
              component: ComputersList
            },
            {
              path: ":id/details",
              props: route => {
                return { id: route.params.id, collection: "Computers" };
              },
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
              props: { collection: "Profiles" },
              component: ProfilesList
            },
            {
              path: ":id/edit",
              props: route => {
                return { id: route.params.id, collection: "Profiles" };
              },
              name: "Edit Profile",
              component: ProfilesEdit
            }
          ]
        },
        {
          path: "jobs",
          name: "Jobs",
          redirect: "/admin/jobs/list",
          component: Jobs,
          children: [
            {
              path: "list",
              name: "Jobs List",
              props: { collection: "Jobs" },
              component: JobsList
            },
            {
              path: "add",
              name: "Add Job",
              props: { collection: "Jobs" },
              component: JobsEdit
            },
            {
              path: ":id/edit",
              props: route => {
                return { id: route.params.id, collection: "Jobs" };
              },
              name: "Edit Job",
              component: JobsEdit
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
              props: { collection: "Divisions" },
              component: TimeTypesDivisionsList
            },
            {
              path: "add",
              name: "Add Division",
              props: { collection: "Divisions" },
              component: TimeTypesDivisionsEdit
            },
            {
              path: ":id/edit",
              props: route => {
                return { id: route.params.id, collection: "Divisions" };
              },
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
              props: { collection: "TimeTypes" },
              component: TimeTypesDivisionsList
            },
            {
              path: "add",
              name: "Add Time Type",
              props: { collection: "TimeTypes" },
              component: TimeTypesDivisionsEdit
            },
            {
              path: ":id/edit",
              props: route => {
                return { id: route.params.id, collection: "TimeTypes" };
              },
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
