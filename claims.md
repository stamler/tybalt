# Claims Reference
<!-- markdownlint-disable MD013 -->

Generated from repository search on this workspace.

## Scope and Method

- Scope searched: `backend/` and `frontend/`.
- Claim list source: user-provided claim names.
- Raw-hit regex per claim includes:
  - quoted literals: `"claim"` and `'claim'`
  - claim property access forms: `claims.claim`, `claims["claim"]`, `claims['claim']`
  - custom claim access forms: `customClaims.claim`, `token.claim`, `auth.token.claim`
- Raw hits are listed as `path:line` in the appendix.
- Note: for broad words like `time` and `job`, raw hits include both claim checks and domain field usage.

## Claim Summary

| Claim            | Primary capability afforded                                                                 | Representative enforcement points                                                                                                                        |
|------------------|---------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| `absorb`         | No active capability found.                                                                 | No hits in searched scope.                                                                                                                               |
| `admin`          | Broad administrative access across jobs, profiles, config, reports, and ops functions.      | `backend/firestore/firestore.rules`, `backend/functions/src/jobs.ts`, `backend/functions/src/mutations.ts`, `backend/functions/src/wireguard.ts`         |
| `assignComputer` | Assign a computer to a user via callable function.                                          | `backend/functions/src/computers.ts`                                                                                                                     |
| `baseit`         | Approve user mutations.                                                                     | `backend/functions/src/mutations.ts`                                                                                                                     |
| `busdev`         | No active capability found.                                                                 | No hits in searched scope.                                                                                                                               |
| `chat`           | Use AI chat callable APIs (create, delete, retry).                                          | `backend/functions_v2/src/ai.ts`                                                                                                                         |
| `computers`      | Read Computers data and access Computers admin route.                                       | `backend/firestore/firestore.rules`, `frontend/src/router.ts`                                                                                            |
| `cor`            | Read profiles and update only restricted profile field(s).                                  | `backend/firestore/firestore.rules`                                                                                                                      |
| `eapr`           | Expense approver capabilities (read approved/committed, commit, reject in rejection flow).  | `backend/firestore/firestore.rules`, `backend/functions_v2/src/rejection.ts`, `backend/storage/storage.rules`                                            |
| `hr`             | HR mutation operations and restricted profile, user reads, and updates.                     | `backend/functions/src/mutations.ts`, `backend/firestore/firestore.rules`                                                                                |
| `job`            | Job-admin behavior including job create/update and invoice privileges in specific flows.    | `backend/firestore/firestore.rules`, `backend/functions/src/invoices.ts`, `frontend/src/router.ts`                                                       |
| `kpi`            | Run KPI SQL report query set.                                                               | `backend/functions/src/sqlQueries.ts`                                                                                                                    |
| `ovals`          | Update opening time-off values.                                                             | `backend/functions/src/profiles.ts`                                                                                                                      |
| `report`         | Reporting access to report queries, report collections, exports, and report-oriented reads. | `backend/functions/src/sqlQueries.ts`, `backend/firestore/firestore.rules`, `backend/storage/storage.rules`                                              |
| `smg`            | Senior management PO approval, rejection, and read flows.                                   | `backend/functions_v2/src/pos.ts`, `backend/functions_v2/src/rejection.ts`, `backend/firestore/firestore.rules`                                          |
| `tame`           | Time amendment administration and amendment commit operations.                              | `backend/firestore/firestore.rules`, `backend/functions/src/timesheets.ts`                                                                               |
| `tapr`           | Time approver or manager capabilities for timesheets and expenses.                          | `backend/firestore/firestore.rules`, `backend/functions_v2/src/rejection.ts`, `backend/functions/src/sqlQueries.ts`                                      |
| `time`           | Core end-user time, expense, presence, and PO actions.                                      | `backend/firestore/firestore.rules`, `backend/functions/src/bundleTimesheets.ts`, `backend/functions/src/presence.ts`, `backend/functions_v2/src/pos.ts` |
| `tslock`         | Lock approved timesheets for export workflow.                                               | `backend/functions/src/timesheets.ts`                                                                                                                    |
| `tsrej`          | Reject approved timesheets in dedicated rejection paths.                                    | `backend/firestore/firestore.rules`, `backend/functions_v2/src/rejection.ts`                                                                             |
| `tsunlock`       | Unlock timesheets and uncommit expenses in privileged recovery flows.                       | `backend/functions/src/timesheets.ts`, `backend/functions/src/expenses.ts`                                                                               |
| `vp`             | VP PO approval, rejection, and read paths.                                                  | `backend/functions_v2/src/pos.ts`, `backend/functions_v2/src/rejection.ts`, `backend/firestore/firestore.rules`                                          |
| `wg`             | WireGuard operator access (read and selected WireGuard actions).                            | `backend/functions/src/wireguard.ts`, `backend/firestore/firestore.rules`                                                                                |

## Raw Hit Locations

### `absorb`

- No raw hits found.

### `admin`

- Hit count: 43
- `backend/firestore/firestore.rules:584`
- `backend/firestore/firestore.rules:621`
- `backend/firestore/firestore.rules:624`
- `backend/firestore/firestore.rules:627`
- `backend/firestore/firestore.rules:633`
- `backend/firestore/firestore.rules:722`
- `backend/firestore/firestore.rules:795`
- `backend/firestore/firestore.rules:798`
- `backend/firestore/firestore.rules:816`
- `backend/firestore/firestore.rules:824`
- `backend/firestore/firestore.rules:880`
- `backend/firestore/firestore.rules:883`
- `backend/firestore/firestore.rules:886`
- `backend/firestore/firestore.rules:889`
- `backend/functions/src/expenses.ts:129`
- `backend/functions/src/jobs.ts:189`
- `backend/functions/src/jobs.ts:197`
- `backend/functions/src/jobs.ts:21`
- `backend/functions/src/jobs.ts:213`
- `backend/functions/src/jobs.ts:251`
- `backend/functions/src/mutations.ts:210`
- `backend/functions/src/mutations.ts:211`
- `backend/functions/src/mutations.ts:374`
- `backend/functions/src/mutations.ts:375`
- `backend/functions/src/mutations.ts:662`
- `backend/functions/src/mutations.ts:663`
- `backend/functions/src/timesheets.ts:137`
- `backend/functions/src/wireguard.ts:146`
- `backend/functions/src/wireguard.ts:147`
- `backend/functions/src/wireguard.ts:187`
- `backend/functions/src/wireguard.ts:188`
- `backend/functions/src/wireguard.ts:300`
- `backend/functions/src/wireguard.ts:301`
- `backend/functions/src/wireguard.ts:42`
- `backend/functions/src/wireguard.ts:43`
- `frontend/src/components/ExpenseTrackingList.vue:74`
- `frontend/src/components/ExpenseTrackingList.vue:75`
- `frontend/src/router.ts:518`
- `frontend/src/router.ts:638`
- `frontend/src/router.ts:718`
- `frontend/src/router.ts:720`
- `frontend/src/router.ts:809`
- `frontend/src/router.ts:843`

### `assignComputer`

- Hit count: 1
- `backend/functions/src/computers.ts:29`

### `baseit`

- Hit count: 1
- `backend/functions/src/mutations.ts:663`

### `busdev`

- No raw hits found.

### `chat`

- Hit count: 6
- `backend/functions_v2/src/ai.ts:116`
- `backend/functions_v2/src/ai.ts:206`
- `backend/functions_v2/src/ai.ts:40`
- `frontend/src/components/AIChat.vue:2`
- `frontend/src/components/AIChatsList.vue:20`
- `frontend/src/router.ts:388`

### `computers`

- Hit count: 4
- `backend/firestore/firestore.rules:584`
- `frontend/src/components/ComputersList.vue:52`
- `frontend/src/router.ts:547`
- `frontend/src/router.ts:549`

### `cor`

- Hit count: 2
- `backend/firestore/firestore.rules:627`
- `backend/firestore/firestore.rules:640`

### `eapr`

- Hit count: 6
- `backend/firestore/firestore.rules:739`
- `backend/firestore/firestore.rules:760`
- `backend/functions_v2/src/rejection.ts:100`
- `backend/functions_v2/src/rejection.ts:92`
- `backend/storage/storage.rules:37`
- `frontend/src/router.ts:470`

### `hr`

- Hit count: 6
- `backend/firestore/firestore.rules:636`
- `backend/firestore/firestore.rules:883`
- `backend/firestore/firestore.rules:886`
- `backend/firestore/firestore.rules:889`
- `backend/functions/src/mutations.ts:211`
- `backend/functions/src/mutations.ts:375`

### `job`

- Hit count: 36
- `backend/firestore/firestore.indexes.json:220`
- `backend/firestore/firestore.rules:111`
- `backend/firestore/firestore.rules:117`
- `backend/firestore/firestore.rules:130`
- `backend/firestore/firestore.rules:243`
- `backend/firestore/firestore.rules:257`
- `backend/firestore/firestore.rules:266`
- `backend/firestore/firestore.rules:292`
- `backend/firestore/firestore.rules:308`
- `backend/firestore/firestore.rules:360`
- `backend/firestore/firestore.rules:381`
- `backend/firestore/firestore.rules:62`
- `backend/firestore/firestore.rules:660`
- `backend/firestore/firestore.rules:684`
- `backend/firestore/firestore.rules:714`
- `backend/firestore/firestore.rules:77`
- `backend/firestore/firestore.rules:83`
- `backend/functions/src/invoices.ts:39`
- `backend/functions/src/sync.ts:1158`
- `backend/functions/src/sync.ts:192`
- `backend/functions/src/sync.ts:358`
- `backend/functions/src/sync.ts:480`
- `backend/functions/test/invoices.test.ts:52`
- `backend/functions/test/invoices.test.ts:61`
- `frontend/src/components/InvoiceDetails.vue:136`
- `frontend/src/components/JobsDetails.vue:203`
- `frontend/src/components/JobsEdit.vue:12`
- `frontend/src/components/JobsEdit.vue:14`
- `frontend/src/components/PurchaseOrderRequestsList.vue:254`
- `frontend/src/components/TimeEntriesEdit.vue:334`
- `frontend/src/components/TimeEntriesList.vue:437`
- `frontend/src/components/helpers.ts:277`
- `frontend/src/components/mixins.ts.deprecated:698`
- `frontend/src/components/mixins.ts.deprecated:962`
- `frontend/src/components/types.ts:287`
- `frontend/src/router.ts:681`

### `kpi`

- Hit count: 5
- `backend/functions/src/sqlQueries.ts:25`
- `backend/functions/src/sqlQueries.ts:26`
- `backend/functions/src/sqlQueries.ts:27`
- `backend/functions/src/sqlQueries.ts:28`
- `frontend/src/router.ts:494`

### `ovals`

- Hit count: 1
- `backend/functions/src/profiles.ts:390`

### `report`

- Hit count: 27
- `backend/firestore/firestore.rules:627`
- `backend/firestore/firestore.rules:714`
- `backend/firestore/firestore.rules:740`
- `backend/firestore/firestore.rules:791`
- `backend/firestore/firestore.rules:795`
- `backend/firestore/firestore.rules:798`
- `backend/firestore/firestore.rules:800`
- `backend/firestore/firestore.rules:816`
- `backend/firestore/firestore.rules:825`
- `backend/functions/src/profiles.ts:591`
- `backend/functions/src/sqlQueries.ts:21`
- `backend/functions/src/sqlQueries.ts:22`
- `backend/functions/src/sqlQueries.ts:23`
- `backend/functions/src/sqlQueries.ts:24`
- `backend/functions/src/sqlQueries.ts:29`
- `backend/functions/src/sqlQueries.ts:30`
- `backend/functions/src/sqlQueries.ts:31`
- `backend/functions/src/timesheets.ts:746`
- `backend/storage/storage.rules:26`
- `backend/storage/storage.rules:30`
- `backend/storage/storage.rules:38`
- `backend/storage/storage.rules:53`
- `frontend/src/components/JobsDetails.vue:106`
- `frontend/src/components/JobsDetails.vue:125`
- `frontend/src/components/JobsDetails.vue:257`
- `frontend/src/router.ts:115`
- `frontend/src/router.ts:470`

### `smg`

- Hit count: 11
- `backend/firestore/firestore.rules:781`
- `backend/functions_v2/src/pos.ts:150`
- `backend/functions_v2/src/pos.ts:201`
- `backend/functions_v2/src/pos.ts:299`
- `backend/functions_v2/src/pos.ts:312`
- `backend/functions_v2/src/pos.ts:342`
- `backend/functions_v2/src/rejection.ts:121`
- `backend/functions_v2/src/rejection.ts:130`
- `backend/storage/storage.rules:52`
- `frontend/src/components/PurchaseOrderRequestsList.vue:123`
- `frontend/src/components/PurchaseOrderRequestsList.vue:134`

### `tame`

- Hit count: 6
- `backend/firestore/firestore.rules:725`
- `backend/firestore/firestore.rules:726`
- `backend/firestore/firestore.rules:727`
- `backend/firestore/firestore.rules:728`
- `backend/firestore/firestore.rules:823`
- `backend/functions/src/timesheets.ts:679`

### `tapr`

- Hit count: 30
- `backend/firestore/firestore.rules:627`
- `backend/firestore/firestore.rules:738`
- `backend/firestore/firestore.rules:755`
- `backend/firestore/firestore.rules:757`
- `backend/firestore/firestore.rules:821`
- `backend/firestore/firestore.rules:843`
- `backend/firestore/firestore.rules:850`
- `backend/firestore/firestore.rules:861`
- `backend/functions/src/bundleTimesheets.ts:202`
- `backend/functions/src/profiles.ts:214`
- `backend/functions/src/sqlQueries.ts:21`
- `backend/functions/src/sqlQueries.ts:22`
- `backend/functions_v2/src/pos.ts:62`
- `backend/functions_v2/src/rejection.ts:101`
- `backend/functions_v2/src/rejection.ts:64`
- `backend/functions_v2/src/rejection.ts:73`
- `backend/functions_v2/src/rejection.ts:92`
- `backend/storage/storage.rules:36`
- `frontend/src/components/JobsDetails.vue:106`
- `frontend/src/components/ProfilesList.vue:47`
- `frontend/src/components/TimeOff.vue:26`
- `frontend/src/components/TimeSheetsDetails.vue:303`
- `frontend/src/components/TimeSheetsDetails.vue:304`
- `frontend/src/components/TimeSheetsDetails.vue:313`
- `frontend/src/components/TimeSheetsDetails.vue:314`
- `frontend/src/router.ts:184`
- `frontend/src/router.ts:195`
- `frontend/src/router.ts:206`
- `frontend/src/router.ts:303`
- `frontend/src/router.ts:314`

### `time`

- Hit count: 54
- `backend/firestore/firestore.indexes.json:12`
- `backend/firestore/firestore.rules:587`
- `backend/firestore/firestore.rules:610`
- `backend/firestore/firestore.rules:617`
- `backend/firestore/firestore.rules:715`
- `backend/firestore/firestore.rules:731`
- `backend/firestore/firestore.rules:732`
- `backend/firestore/firestore.rules:733`
- `backend/firestore/firestore.rules:737`
- `backend/firestore/firestore.rules:743`
- `backend/firestore/firestore.rules:751`
- `backend/firestore/firestore.rules:753`
- `backend/firestore/firestore.rules:775`
- `backend/firestore/firestore.rules:777`
- `backend/firestore/firestore.rules:787`
- `backend/firestore/firestore.rules:789`
- `backend/firestore/firestore.rules:820`
- `backend/firestore/firestore.rules:829`
- `backend/firestore/firestore.rules:831`
- `backend/firestore/firestore.rules:837`
- `backend/functions/src/bundleTimesheets.ts:22`
- `backend/functions/src/bundleTimesheets.ts:26`
- `backend/functions/src/invoices.ts:18`
- `backend/functions/src/presence.ts:17`
- `backend/functions/src/presence.ts:56`
- `backend/functions/src/sqlQueries.ts:15`
- `backend/functions/src/sqlQueries.ts:16`
- `backend/functions/src/sqlQueries.ts:17`
- `backend/functions/src/sqlQueries.ts:18`
- `backend/functions/src/sqlQueries.ts:19`
- `backend/functions/src/sqlQueries.ts:20`
- `backend/functions/src/storage.ts:256`
- `backend/functions/src/storage.ts:288`
- `backend/functions/src/timesheets.ts:58`
- `backend/functions/src/wireguard.ts:257`
- `backend/functions_v2/src/ai.ts:225`
- `backend/functions_v2/src/ai.ts:304`
- `backend/functions_v2/src/pos.ts:150`
- `backend/functions_v2/src/pos.ts:201`
- `backend/functions_v2/src/pos.ts:21`
- `backend/functions_v2/src/pos.ts:234`
- `backend/functions_v2/src/pos.ts:323`
- `backend/functions_v2/src/rejection.ts:121`
- `backend/storage/storage.rules:35`
- `backend/storage/storage.rules:49`
- `backend/storage/storage.rules:50`
- `frontend/src/components/AIChat.vue:215`
- `frontend/src/components/CheckInHistory.vue:56`
- `frontend/src/components/CheckInReport.vue:70`
- `frontend/src/components/CheckInReport.vue:71`
- `frontend/src/router.ts:133`
- `frontend/src/router.ts:267`
- `frontend/src/router.ts:414`
- `frontend/src/router.ts:70`

### `tslock`

- Hit count: 1
- `backend/functions/src/timesheets.ts:494`

### `tsrej`

- Hit count: 5
- `backend/firestore/firestore.rules:822`
- `backend/functions_v2/src/rejection.ts:64`
- `backend/functions_v2/src/rejection.ts:73`
- `frontend/src/components/TimeSheetsDetails.vue:322`
- `frontend/src/components/TimeSheetsDetails.vue:323`

### `tsunlock`

- Hit count: 2
- `backend/functions/src/expenses.ts:363`
- `backend/functions/src/timesheets.ts:404`

### `vp`

- Hit count: 12
- `backend/firestore/firestore.rules:779`
- `backend/functions_v2/src/pos.ts:150`
- `backend/functions_v2/src/pos.ts:201`
- `backend/functions_v2/src/pos.ts:299`
- `backend/functions_v2/src/pos.ts:303`
- `backend/functions_v2/src/pos.ts:304`
- `backend/functions_v2/src/pos.ts:344`
- `backend/functions_v2/src/rejection.ts:121`
- `backend/functions_v2/src/rejection.ts:130`
- `backend/storage/storage.rules:51`
- `frontend/src/components/PurchaseOrderRequestsList.vue:138`
- `frontend/src/components/PurchaseOrderRequestsList.vue:149`

### `wg`

- Hit count: 3
- `backend/firestore/firestore.rules:889`
- `backend/functions/src/wireguard.ts:147`
- `backend/functions/src/wireguard.ts:43`
