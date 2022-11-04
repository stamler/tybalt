import Vue from "vue";
import Router from "vue-router";

// Components
import MainView from "@/views/MainView.vue";
import WelcomeSettings from "@/components/WelcomeSettings.vue";
import ExpensesEdit from "@/components/ExpensesEdit.vue";
import ExpensesList from "@/components/ExpensesList.vue";
import ExpensesQueue from "@/components/ExpensesQueue.vue";
import TimeEntriesList from "@/components/TimeEntriesList.vue";
import TimeEntriesEdit from "@/components/TimeEntriesEdit.vue";
import TimeSheetsList from "@/components/TimeSheetsList.vue";
import TimeSheetsDetails from "@/components/TimeSheetsDetails.vue";
import PayrollTrackingList from "@/components/PayrollTrackingList.vue";
import TimeTrackingList from "@/components/TimeTrackingList.vue";
import TimeTrackingDetails from "@/components/TimeTrackingDetails.vue";
import ExpenseTrackingList from "@/components/ExpenseTrackingList.vue";
import ExpenseTrackingDetails from "@/components/ExpenseTrackingDetails.vue";
import LoginsList from "@/components/LoginsList.vue";
import RawLoginsList from "@/components/RawLoginsList.vue";
import ContentShell from "@/components/ContentShell.vue";
import KPIReports from "@/components/KPIReports.vue";
import ComputersList from "@/components/ComputersList.vue";
import ComputersDetails from "@/components/ComputersDetails.vue";
import UsersList from "@/components/UsersList.vue";
import UserMutationsList from "@/components/UserMutationsList.vue";
import UsersEdit from "@/components/UsersEdit.vue";
import UsersDetails from "@/components/UsersDetails.vue";
import ProfilesList from "@/components/ProfilesList.vue";
import ProfilesBulkEdit from "@/components/ProfilesBulkEdit.vue";
import ProfilesEdit from "@/components/ProfilesEdit.vue";
//import JobsList from "@/components/JobsList.vue";
import JobsSearch from "@/components/JobsSearch.vue";
import JobsEdit from "@/components/JobsEdit.vue";
import JobsDetails from "@/components/JobsDetails.vue";
import TimeTypesDivisionsList from "@/components/TimeTypesDivisionsList.vue";
import TimeTypesDivisionsEdit from "@/components/TimeTypesDivisionsEdit.vue";

Vue.use(Router);

const router = new Router({
  mode: "history",
  base: process.env.BASE_URL,
  routes: [
    {
      path: "/",
      redirect: "/me",
    },
    {
      path: "/me",
      component: WelcomeSettings,
    },
    {
      path: "/time",
      name: "Time",
      meta: { claims: ["time"] },
      redirect: "/time/entries",
      component: MainView,
      children: [
        {
          path: "entries",
          name: "Time Entries",
          redirect: "/time/entries/list",
          component: ContentShell,
          children: [
            {
              meta: { showInUi: true, uiName: "List" },
              path: "list",
              name: "Time Entries List",
              props: { collection: "TimeEntries" },
              component: TimeEntriesList,
            },
            {
              meta: { showInUi: true, uiName: "Add" },
              path: "add",
              name: "Add Time Entry",
              props: { collection: "TimeEntries" },
              component: TimeEntriesEdit,
            },
            {
              path: ":id/edit",
              props: (route) => {
                return { id: route.params.id, collection: "TimeEntries" };
              },
              name: "Edit Time Entry",
              component: TimeEntriesEdit,
            },
          ],
        },
        {
          path: "sheets",
          name: "Time Sheets",
          redirect: "/time/sheets/list",
          component: ContentShell,
          children: [
            {
              meta: { showInUi: true, uiName: "List" },
              path: "list",
              name: "Time Sheets List",
              props: { query: "list", collection: "TimeSheets" },
              component: TimeSheetsList,
            },
            {
              meta: {
                showInUi: true,
                uiName: "Pending",
                requiredClaims: ["tapr"],
              },
              path: "pending",
              name: "Time Sheets Pending",
              props: { query: "pending", collection: "TimeSheets" },
              component: TimeSheetsList,
            },
            {
              meta: {
                showInUi: true,
                uiName: "Approved",
                requiredClaims: ["tapr"],
              },
              path: "approved",
              name: "Time Sheets Approved",
              props: { query: "approved", collection: "TimeSheets" },
              component: TimeSheetsList,
            },
            {
              meta: {
                showInUi: true,
                uiName: "Shared",
                requiredClaims: ["tapr"],
              },
              path: "shared",
              name: "Time Sheets Shared",
              props: { query: "shared", collection: "TimeSheets" },
              component: TimeSheetsList,
            },
            {
              path: ":id/details",
              props: (route) => {
                return { id: route.params.id, collection: "TimeSheets" };
              },
              name: "Time Sheet Details",
              component: TimeSheetsDetails,
            },
          ],
        },
        {
          path: "amendments",
          name: "Time Amendments",
          redirect: "/time/amendments/list",
          component: ContentShell,
          children: [
            {
              meta: { showInUi: true, uiName: "List" },
              path: "list",
              name: "Time Amendments List",
              props: { collection: "TimeAmendments" },
              component: TimeEntriesList,
            },
            {
              meta: { showInUi: true, uiName: "Add" },
              path: "add",
              name: "Add Time Amendment",
              props: { collection: "TimeAmendments" },
              component: TimeEntriesEdit,
            },
            {
              path: ":id/edit",
              props: (route) => {
                return { id: route.params.id, collection: "TimeAmendments" };
              },
              name: "Edit Time Amendments",
              component: TimeEntriesEdit,
            },
          ],
        },
      ],
    },
    {
      path: "/expense",
      name: "Expense",
      meta: { claims: ["time"] },
      redirect: "/expense/entries",
      component: MainView,
      children: [
        {
          path: "entries",
          name: "Expenses",
          redirect: "/expense/entries/list",
          component: ContentShell,
          children: [
            {
              meta: { showInUi: true, uiName: "List" },
              path: "list",
              name: "Expenses List",
              props: { collection: "Expenses" },
              component: ExpensesList,
            },
            {
              meta: { showInUi: true, uiName: "Add" },
              path: "add",
              name: "Add Expense",
              props: { collection: "Expenses" },
              component: ExpensesEdit,
            },
            {
              path: ":id/edit",
              props: (route) => {
                return { id: route.params.id, collection: "Expenses" };
              },
              name: "Edit Expense Entry",
              component: ExpensesEdit,
            },
            {
              meta: {
                showInUi: true,
                uiName: "Pending",
                requiredClaims: ["tapr"],
              },
              path: "pending",
              name: "Expenses Pending",
              props: { approved: false, collection: "Expenses" },
              component: ExpensesList,
            },
            {
              meta: {
                showInUi: true,
                uiName: "Approved",
                requiredClaims: ["tapr"],
              },
              path: "approved",
              name: "Expenses Approved",
              props: { approved: true, collection: "Expenses" },
              component: ExpensesList,
            },
          ],
        },
      ],
    },
    {
      path: "/reports",
      name: "Reports",
      meta: { claims: ["reports"] },
      redirect: "/reports/time",
      component: MainView,
      children: [
        {
          path: "time",
          name: "Time Tracking",
          redirect: "/reports/time/list",
          component: ContentShell,
          children: [
            {
              meta: { showInUi: true, uiName: "List" },
              path: "list",
              name: "Time Tracking List",
              props: { collection: "TimeTracking" },
              component: TimeTrackingList,
            },
            {
              path: ":id/details",
              props: (route) => {
                return { id: route.params.id, collection: "TimeTracking" };
              },
              name: "Time Tracking Details",
              component: TimeTrackingDetails,
            },
          ],
        },
        {
          path: "expense",
          name: "Expense Tracking",
          redirect: "/reports/expense/list",
          component: ContentShell,
          children: [
            {
              meta: { showInUi: true, uiName: "List" },
              path: "list",
              name: "Expense List",
              props: { collection: "ExpenseTracking" },
              component: ExpenseTrackingList,
            },
            {
              path: ":id/details",
              props: (route) => {
                return { id: route.params.id, collection: "ExpenseTracking" };
              },
              name: "Expense Tracking Details",
              component: ExpenseTrackingDetails,
            },
            {
              meta: {
                showInUi: true,
                uiName: "Commit Queue",
                requiredClaims: ["eapr", "report"],
              },
              path: "queue",
              name: "Expenses Commit Queue",
              props: { collection: "Expenses" },
              component: ExpensesQueue,
            },
          ],
        },
        {
          path: "payroll",
          name: "Payroll",
          redirect: "/reports/payroll/list",
          component: ContentShell,
          children: [
            {
              meta: { showInUi: true, uiName: "List" },
              path: "list",
              name: "Payroll List",
              props: { collection: "PayrollTracking" },
              component: PayrollTrackingList,
            },
          ],
        },
        {
          path: "kpi",
          name: "KPI",
          redirect: "/reports/kpi/list",
          component: ContentShell,
          children: [
            {
              meta: { showInUi: true, uiName: "List" },
              path: "list",
              name: "KPI List",
              component: KPIReports,
            },
          ],
        },
      ],
    },
    {
      path: "/admin",
      name: "Admin",
      redirect: "/admin/logins",
      component: MainView,
      children: [
        {
          path: "logins",
          name: "Logins",
          meta: { claims: ["admin"] },
          redirect: "/admin/logins/list",
          component: ContentShell,
          children: [
            {
              meta: { showInUi: true, uiName: "List" },
              path: "list",
              name: "Logins List",
              props: { collection: "Logins" },
              component: LoginsList,
            },
          ],
        },
        {
          path: "rawlogins",
          name: "Raw Logins",
          meta: { claims: ["rawlogins", "audit"] },
          redirect: "/admin/rawlogins/list",
          component: ContentShell,
          children: [
            {
              meta: { showInUi: true, uiName: "List" },
              path: "list",
              name: "Raw Logins List",
              props: { collection: "RawLogins" },
              component: RawLoginsList,
            },
          ],
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
              component: ComputersList,
            },
            {
              meta: { showInUi: true, uiName: "Retired" },
              path: "retired",
              name: "Retired Computers",
              props: { collection: "Computers", retired: true },
              component: ComputersList,
            },
            {
              path: ":id/details",
              props: (route) => {
                return { id: route.params.id, collection: "Computers" };
              },
              name: "Computer Details",
              component: ComputersDetails,
            },
          ],
        },
        {
          path: "users",
          name: "Users",
          meta: { claims: ["users", "audit"] },
          redirect: "/admin/users/list",
          component: ContentShell,
          children: [
            {
              meta: { showInUi: true, uiName: "List" },
              path: "list",
              name: "Users List",
              props: { query: "list" },
              component: UsersList,
            },
            {
              meta: { showInUi: true, uiName: "AD" },
              path: "ad",
              name: "AD Users List",
              props: { query: "ad" },
              component: UsersList,
            },
            {
              meta: { showInUi: true, uiName: "Not in AD" },
              path: "noad",
              name: "Not in AD Users List",
              props: { query: "noad" },
              component: UsersList,
            },
            {
              meta: { showInUi: true, uiName: "Add" },
              path: "add",
              name: "Add User",
              props: { collection: "Users" },
              component: UsersEdit,
            },
            {
              path: ":id/edit",
              props: (route) => {
                return { id: route.params.id, collection: "Users" };
              },
              name: "Edit User",
              component: UsersEdit,
            },
            {
              meta: { showInUi: true, uiName: "Mutations" },
              path: "mutations",
              name: "User Mutations",
              component: UserMutationsList,
            },
            {
              path: ":id/details",
              props: true,
              name: "User Details",
              component: UsersDetails,
            },
          ],
        },
        {
          path: "profiles",
          name: "Profiles",
          redirect: "/admin/profiles/list",
          meta: { claims: ["admin"] },
          component: ContentShell,
          children: [
            {
              meta: { showInUi: true, uiName: "List" },
              path: "list",
              name: "Profiles List",
              props: { collection: "Profiles" },
              component: ProfilesList,
            },
            {
              meta: { showInUi: true, uiName: "Bulk Edit" },
              path: "bulkedit",
              name: "Bulk Edit",
              props: { collection: "Profiles" },
              component: ProfilesBulkEdit,
            },
            {
              path: ":id/edit",
              props: (route) => {
                return { id: route.params.id, collection: "Profiles" };
              },
              name: "Edit Profile",
              component: ProfilesEdit,
            },
          ],
        },
        {
          path: "jobs",
          name: "Jobs",
          redirect: "/admin/jobs/search",
          component: ContentShell,
          children: [
            /*
            {
              meta: { showInUi: true, uiName: "List" },
              path: "list",
              name: "Jobs List",
              props: { collection: "Jobs" },
              component: JobsList,
            },
            */
            {
              meta: { showInUi: true, uiName: "Search" },
              path: "search",
              name: "Jobs Search",
              props: { collection: "Jobs" },
              component: JobsSearch,
            },
            {
              meta: {
                showInUi: true,
                uiName: "Add",
                requiredClaims: ["job"],
              },
              path: "add",
              name: "Add Job",
              props: { collection: "Jobs" },
              component: JobsEdit,
            },
            {
              path: ":id/edit",
              props: (route) => {
                return { id: route.params.id, collection: "Jobs" };
              },
              name: "Edit Job",
              component: JobsEdit,
            },
            {
              path: ":id/details",
              props: (route) => {
                return { id: route.params.id, collection: "Jobs" };
              },
              name: "Job Details",
              component: JobsDetails,
            },
          ],
        },
        {
          path: "divisions",
          name: "Divisions",
          redirect: "/admin/divisions/list",
          component: ContentShell,
          children: [
            {
              meta: { showInUi: true, uiName: "List" },
              path: "list",
              name: "Divisions List",
              props: { collection: "Divisions" },
              component: TimeTypesDivisionsList,
            },
            {
              meta: {
                showInUi: true,
                uiName: "Add",
                requiredClaims: ["admin"],
              },
              path: "add",
              name: "Add Division",
              props: { collection: "Divisions" },
              component: TimeTypesDivisionsEdit,
            },
            {
              path: ":id/edit",
              props: (route) => {
                return { id: route.params.id, collection: "Divisions" };
              },
              name: "Edit Division",
              component: TimeTypesDivisionsEdit,
            },
          ],
        },
        {
          path: "timetypes",
          name: "Time Types",
          redirect: "/admin/timetypes/list",
          component: ContentShell,
          children: [
            {
              meta: { showInUi: true, uiName: "List" },
              path: "list",
              name: "Time Types List",
              props: { collection: "TimeTypes" },
              component: TimeTypesDivisionsList,
            },
            {
              meta: {
                showInUi: true,
                uiName: "Add",
                requiredClaims: ["admin"],
              },
              path: "add",
              name: "Add Time Type",
              props: { collection: "TimeTypes" },
              component: TimeTypesDivisionsEdit,
            },
            {
              path: ":id/edit",
              props: (route) => {
                return { id: route.params.id, collection: "TimeTypes" };
              },
              name: "Edit Time Type",
              component: TimeTypesDivisionsEdit,
            },
          ],
        },
      ],
    },
    {
      path: "*",
      component: { template: "<h1>404</h1>" },
    },
  ],
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
