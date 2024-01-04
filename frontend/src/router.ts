import { createRouter, createWebHistory } from "vue-router";
import { v4 as uuidv4 } from "uuid";
// Components
import MainView from "@/views/MainView.vue";
import WelcomeSettings from "@/components/WelcomeSettings.vue";
import CheckIn from "@/components/CheckIn.vue";
import VacationsEdit from "@/components/VacationsEdit.vue";
import VacationsList from "@/components/VacationsList.vue";
import CheckInHistory from "@/components/CheckInHistory.vue";
import CheckInReport from "@/components/CheckInReport.vue";
import AIChat from "@/components/AIChat.vue";
import AIChatsList from "@/components/AIChatsList.vue";
import ExpensesEdit from "@/components/ExpensesEdit.vue";
import ExpensesList from "@/components/ExpensesList.vue";
import PurchaseOrderRequestsEdit from "@/components/PurchaseOrderRequestsEdit.vue";
import PurchaseOrderRequestsList from "@/components/PurchaseOrderRequestsList.vue";
import ExpensesQueue from "@/components/ExpensesQueue.vue";
import TimeEntriesList from "@/components/TimeEntriesList.vue";
import TimeEntriesEdit from "@/components/TimeEntriesEdit.vue";
import TimeOff from "@/components/TimeOff.vue";
import TimeSheetsList from "@/components/TimeSheetsList.vue";
import TimeSheetsDetails from "@/components/TimeSheetsDetails.vue";
import PayrollTrackingList from "@/components/PayrollTrackingList.vue";
import TimeTrackingList from "@/components/TimeTrackingList.vue";
import TimeTrackingDetails from "@/components/TimeTrackingDetails.vue";
import TimeTrackingAudit from "@/components/TimeTrackingAudit.vue";
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
import JobsStale from "@/components/JobsStale.vue";
import JobsNoTime from "@/components/JobsNoTime.vue";
import JobsLegacyManager from "@/components/JobsLegacyManager.vue";
import JobsSearch from "@/components/JobsSearch.vue";
import JobsEdit from "@/components/JobsEdit.vue";
import JobsAdmin from "@/components/JobsAdmin.vue";
import JobsDetails from "@/components/JobsDetails.vue";
import CreateInvoice from "@/components/CreateInvoice.vue";
import InvoiceDetails from "@/components/InvoiceDetails.vue";
import TimeTypesDivisionsList from "@/components/TimeTypesDivisionsList.vue";
import TimeTypesDivisionsEdit from "@/components/TimeTypesDivisionsEdit.vue";
import WireGuardClientsList from "@/components/WireGuardClientsList.vue";
import WireGuardClientAdd from "@/components/WireGuardClientAdd.vue";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
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
      path: "/presence",
      name: "Presence",
      meta: { claims: ["time"] },
      redirect: "/presence/checkin",
      component: MainView,
      children: [
        {
          path: "checkin",
          name: "Check In",
          redirect: "/presence/checkin/add",
          component: ContentShell,
          children: [
            {
              meta: { showInUi: true, uiName: "Add" },
              path: "add",
              name: "Add Check In",
              component: CheckIn,
            },
            {
              meta: { showInUi: true, uiName: "History" },
              path: "history",
              name: "Check In History",
              component: CheckInHistory,
            },
          ],
        },
        {
          path: "vacation",
          name: "Vacation",
          redirect: "/presence/vacation/list",
          component: ContentShell,
          children: [
            {
              meta: { showInUi: true, uiName: "List" },
              path: "list",
              name: "Vacations List",
              component: VacationsList,
            },
            {
              meta: { showInUi: true, uiName: "Add" },
              path: "add",
              name: "Add Vacation",
              component: VacationsEdit,
            },
          ],
        },
        {
          path: "report",
          name: "Check Ins",
          redirect: "/presence/report/today",
          component: ContentShell,
          children: [
            {
              meta: { showInUi: true, uiName: "Today" },
              path: "today",
              name: "Check In Report Today",
              component: CheckInReport,
            },
          ],
        },
      ],
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
              props: { collectionName: "TimeEntries" },
              component: TimeEntriesList,
            },
            {
              meta: { showInUi: true, uiName: "Add" },
              path: "add",
              name: "Add Time Entry",
              props: { collectionName: "TimeEntries" },
              component: TimeEntriesEdit,
            },
            {
              path: ":id/edit",
              props: (route) => {
                return { id: route.params.id, collectionName: "TimeEntries" };
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
              props: { content: "list" },
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
              props: { content: "pending" },
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
              props: { content: "approved" },
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
              props: { content: "shared" },
              component: TimeSheetsList,
            },
            {
              path: ":id/details",
              props: (route) => {
                return { id: route.params.id, collectionName: "TimeSheets" };
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
              props: { collectionName: "TimeAmendments" },
              component: TimeEntriesList,
            },
            {
              meta: { showInUi: true, uiName: "Add" },
              path: "add",
              name: "Add Time Amendment",
              props: { collectionName: "TimeAmendments" },
              component: TimeEntriesEdit,
            },
            {
              path: ":id/edit",
              props: (route) => {
                return {
                  id: route.params.id,
                  collectionName: "TimeAmendments",
                };
              },
              name: "Edit Time Amendments",
              component: TimeEntriesEdit,
            },
          ],
        },
        {
          path: "off",
          name: "Time Off",
          component: TimeOff,
          meta: { uiName: "Time Off" },
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
              props: { collectionName: "Expenses" },
              component: ExpensesList,
            },
            {
              meta: { showInUi: true, uiName: "Add" },
              path: "add",
              name: "Add Expense",
              props: { collectionName: "Expenses" },
              component: ExpensesEdit,
            },
            {
              path: ":id/edit",
              props: (route) => {
                return { id: route.params.id, collectionName: "Expenses" };
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
              props: { approved: false, collectionName: "Expenses" },
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
              props: { approved: true, collectionName: "Expenses" },
              component: ExpensesList,
            },
          ],
        },
        {
          path: "pos",
          name: "POs",
          redirect: "/expense/pos/requests",
          component: ContentShell,
          children: [
            {
              meta: { showInUi: true, uiName: "List" },
              path: "list",
              name: "Purchase Orders List",
              props: { requests: false },
              component: PurchaseOrderRequestsList,
            },
            {
              meta: { showInUi: true, uiName: "Requests" },
              path: "requests",
              name: "Purchase Order Requests List",
              component: PurchaseOrderRequestsList,
            },
            {
              meta: { showInUi: true, uiName: "Request" },
              path: "request",
              name: "Request Purchase Order",
              props: { collectionName: "PurchaseOrderRequests" },
              component: PurchaseOrderRequestsEdit,
            },
            {
              path: ":id/edit",
              props: (route) => {
                return { id: route.params.id, collectionName: "PurchaseOrderRequests" };
              },
              name: "Edit Purchase Order Request",
              component: PurchaseOrderRequestsEdit,
            },
          ],
        },
      ],
    },
    {
      path: "/ai",
      name: "AI",
      redirect: "/ai/tibby",
      component: MainView,
      children: [
        {
          path: "tibby",
          name: "Tibby",
          redirect: "/ai/tibby/chat",
          component: ContentShell,
          children: [
            {
              meta: { showInUi: true, uiName: "List" },
              path: "chats",
              name: "Tibby History",
              component: AIChatsList,
            },
            {
              meta: { showInUi: true, uiName: "Chat" },
              path: "chat",
              name: "New Tibby Chat",
              redirect() {
                return { name: "Tibby Chat", params: { id: uuidv4() } };
              },
            },
            {
              path: ":id/chat",
              props: (route) => {
                return { id: route.params.id };
              },
              name: "Tibby Chat",
              component: AIChat,
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
              component: TimeTrackingList,
            },
            {
              path: ":id/details",
              props: (route) => {
                return { id: route.params.id, collectionName: "TimeTracking" };
              },
              name: "Time Tracking Details",
              component: TimeTrackingDetails,
            },
            {
              path: ":id/audit",
              props: (route) => {
                return { id: route.params.id };
              },
              name: "Time Tracking Audit",
              component: TimeTrackingAudit,
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
              component: ExpenseTrackingList,
            },
            {
              path: ":id/details",
              props: (route) => {
                return {
                  id: route.params.id,
                  collectionName: "ExpenseTracking",
                };
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
              props: { collectionName: "Expenses" },
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
              props: { collectionName: "Logins" },
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
              props: { collectionName: "Computers" },
              component: ComputersList,
            },
            {
              meta: { showInUi: true, uiName: "Retired" },
              path: "retired",
              name: "Retired Computers",
              props: { collectionName: "Computers", retired: true },
              component: ComputersList,
            },
            {
              path: ":id/details",
              props: (route) => {
                return { id: route.params.id, collectionName: "Computers" };
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
              props: { content: "all" },
              component: UsersList,
            },
            {
              meta: { showInUi: true, uiName: "AD" },
              path: "ad",
              name: "AD Users List",
              props: { content: "ad" },
              component: UsersList,
            },
            {
              meta: { showInUi: true, uiName: "Not in AD" },
              path: "noad",
              name: "Not in AD Users List",
              props: { content: "noad" },
              component: UsersList,
            },
            {
              meta: { showInUi: true, uiName: "Add" },
              path: "add",
              name: "Add User",
              props: { collectionName: "Users" },
              component: UsersEdit,
            },
            {
              path: ":id/edit",
              props: (route) => {
                return { id: route.params.id, collectionName: "Users" };
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
              component: ProfilesList,
            },
            {
              meta: { showInUi: true, uiName: "Bulk Edit" },
              path: "bulkedit",
              name: "Bulk Edit",
              props: { collectionName: "Profiles" },
              component: ProfilesBulkEdit,
            },
            {
              path: ":id/edit",
              props: (route) => {
                return { id: route.params.id, collectionName: "Profiles" };
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
            {
              meta: { showInUi: true, uiName: "Search" },
              path: "search",
              name: "Jobs Search",
              props: { collectionName: "Jobs" },
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
              props: { collectionName: "Jobs" },
              component: JobsEdit,
            },
            {
              meta: { showInUi: true, uiName: "Stale" },
              path: "stale",
              name: "Stale Jobs",
              props: { allUsers: true },
              component: JobsStale,
            },
            {
              meta: { showInUi: true, uiName: "My Stale" },
              path: "stale/mine",
              name: "My Stale Jobs",
              props: { allUsers: false },
              component: JobsStale,
            },
            {
              meta: { showInUi: true, uiName: "No Time" },
              path: "notime",
              name: "Jobs Without Time",
              component: JobsNoTime,
            },
            {
              meta: { showInUi: true, uiName: "Legacy Manager" },
              path: "legacymanager",
              name: "Jobs with Legacy Manager",
              component: JobsLegacyManager,
            },
            {
              meta: {
                showInUi: true,
                uiName: "Admin",
                requiredClaims: ["admin"],
              },
              path: "admin",
              name: "Jobs Admin",
              component: JobsAdmin,
            },
            {
              path: ":id/edit",
              props: (route) => {
                return { id: route.params.id, collectionName: "Jobs" };
              },
              name: "Edit Job",
              component: JobsEdit,
            },
            {
              path: ":id/details",
              props: (route) => {
                return { id: route.params.id, collectionName: "Jobs" };
              },
              name: "Job Details",
              component: JobsDetails,
            },
            {
              path: ":id/invoices/create",
              props: (route) => {
                return { job: route.params.id };
              },
              name: "Create Invoice",
              component: CreateInvoice,
            },
            {
              path: ":id/invoices/:invoiceId/revise",
              props: (route) => {
                return {
                  job: route.params.id,
                  invoiceId: route.params.invoiceId,
                };
              },
              name: "Revise Invoice",
              component: CreateInvoice,
            },
            {
              path: ":id/invoices/:invoiceId/details",
              props: (route) => {
                return {
                  job: route.params.id,
                  invoiceId: route.params.invoiceId,
                };
              },
              name: "Invoice Details",
              component: InvoiceDetails,
            },
          ],
        },
        {
          path: "wireguard",
          name: "WireGuard",
          redirect: "/admin/wireguard/list",
          component: ContentShell,
          children: [
            {
              meta: { showInUi: true, uiName: "Clients" },
              path: "list",
              name: "WireGuard Clients",
              component: WireGuardClientsList,
            },
            {
              meta: { showInUi: true, uiName: "Add" },
              path: "add",
              name: "Add WireGuard Client",
              component: WireGuardClientAdd,
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
              props: { collectionName: "Divisions" },
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
              props: { collectionName: "Divisions" },
              component: TimeTypesDivisionsEdit,
            },
            {
              path: ":id/edit",
              props: (route) => {
                return { id: route.params.id, collectionName: "Divisions" };
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
              props: { collectionName: "TimeTypes" },
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
              props: { collectionName: "TimeTypes" },
              component: TimeTypesDivisionsEdit,
            },
            {
              path: ":id/edit",
              props: (route) => {
                return { id: route.params.id, collectionName: "TimeTypes" };
              },
              name: "Edit Time Type",
              component: TimeTypesDivisionsEdit,
            },
          ],
        },
      ],
    },
    // {
    //   path: "*",
    //   component: { template: "<h1>404</h1>" },
    // },
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
