# Phase 2 Reporting Blockers (tybalt_turbo -> tybalt)

## Scope and validation

This document was re-validated against both repos:

- `tybalt`
  - `backend/functions/src/sync.ts`
  - `backend/functions/src/fold-utils.ts`
  - `backend/functions/src/turboSync.ts`
  - `backend/functions/src/expenses.ts`
  - `backend/functions/src/storage.ts`
- `tybalt_turbo`
  - `app/routes/expenses_writeback.go`

Goal: ensure Phase 2 reporting in legacy `tybalt` remains complete while entry/approval/commit workflows move to `tybalt_turbo`.

## Key findings from tybalt_turbo validation

### Expense writeback already includes workflow flags

`tybalt_turbo` expense writeback already emits:

- `submitted` (bool)
- `approved` (bool)
- `committed` (bool)
- `commitTime` (string timestamp)
- `committedWeekEnding` (string date)
- `payPeriodEnding` (string date)

Code:

- `tybalt_turbo/app/routes/expenses_writeback.go:230`
- `tybalt_turbo/app/routes/expenses_writeback.go:231`
- `tybalt_turbo/app/routes/expenses_writeback.go:232`
- `tybalt_turbo/app/routes/expenses_writeback.go:241`
- `tybalt_turbo/app/routes/expenses_writeback.go:242`
- `tybalt_turbo/app/routes/expenses_writeback.go:243`

Important nuance:

- The export endpoint is currently commit-only (`WHERE ... e.committed != ''`), so non-committed expenses are intentionally not sent to legacy writeback.
- `committedWeekEnding`, `payPeriodEnding`, and `commitTime` are tagged `omitempty` in the JSON response, so malformed/blank values can disappear from payloads.

Code:

- `tybalt_turbo/app/routes/expenses_writeback.go:364`
- `tybalt_turbo/app/routes/expenses_writeback.go:241`
- `tybalt_turbo/app/routes/expenses_writeback.go:242`
- `tybalt_turbo/app/routes/expenses_writeback.go:243`

### tybalt turboSync currently passes through but does not validate contract

`tybalt` already converts writeback expense date fields (`date`, `commitTime`, `committedWeekEnding`, `payPeriodEnding`) before writing staging docs, but it does not enforce required-field validity for reporting.

Code:

- `backend/functions/src/turboSync.ts:133`
- `backend/functions/src/turboSync.ts:135`
- `backend/functions/src/turboSync.ts:500`

## Blocker status (updated)

### 1) Expense fold can be skipped entirely - CONFIRMED

- `foldCollection("TurboExpensesWriteback", "Expenses", ...)` is skipped when `Config/Enable.expenses == true`.
- If skipped, staging data never reaches `Expenses`, so both Firestore and MySQL reporting paths can miss Turbo data.

Code:

- `backend/functions/src/sync.ts:45`
- `backend/functions/src/sync.ts:790`

### 2) Fold conflict/errors leave source docs unmerged - CONFIRMED

- Conflict or multi-match outcomes are logged as `error` and skipped.
- Skipped docs remain in source staging and are excluded from reporting collections.

Code:

- `backend/functions/src/fold-utils.ts:121`
- `backend/functions/src/sync.ts:872`

### 3) Workflow field loss on replace - NARROWED (still a risk)

- Previous concern (missing submit/approve/commit flags from Turbo) is mostly resolved: flags are present in writeback.
- Remaining risk is malformed/blank timestamp/date fields being omitted by writeback and then dropped on replace, because fold preserve policy currently only keeps `submittedDate` and `exported`.

Code:

- `backend/functions/src/sync.ts:49`
- `backend/functions/src/fold-utils.ts:162`

### 4) MySQL CSV excludes non-committed expenses - REFRAMED

- Legacy MySQL export includes only `Expenses` with `committed == true` and `exported == false`.
- Because Turbo writeback is currently commit-only, this is not the primary current gap.
- It remains a failure mode if malformed fold output results in missing/false `committed`.

Code:

- `backend/functions/src/sync.ts:514`
- `backend/functions/src/sync.ts:515`
- `tybalt_turbo/app/routes/expenses_writeback.go:364`

### 5) Firestore artifact generation excludes non-approved/malformed rows - PARTIAL

- Firestore export artifacts still require `approved == true` and `committed == true`.
- Missing `committedWeekEnding`/`payPeriodEnding` still breaks grouping and export eligibility.

Code:

- `backend/functions/src/expenses.ts:198`
- `backend/functions/src/storage.ts:55`
- `backend/functions/src/storage.ts:82`

## Answers to the specific design questions

### Do we need to add fields in `turboSync.ts`?

- Not for basic submit/approve/commit flags: those are already in Turbo writeback.
- Yes for hardening: add validation/normalization/quarantine logic so malformed writeback rows cannot silently degrade reporting.

### Should writeback include commit/approve/submit flags?

- It already does in `tybalt_turbo`.
- We should lock this in with explicit API contract tests so this cannot regress.

### Should this be added back in tybalt before writing (separation of concerns)?

- Recommended: yes. Keep Turbo as source of workflow truth, but enforce a legacy reporting contract in `tybalt` before fold/export.
- This keeps reporting safety local to the reporting system and avoids tight coupling to every future Turbo payload change.

## Implementation options

### Option A - Source contract only (Turbo-centric)

- Enforce all required reporting fields in `tybalt_turbo` export route.
- Add tests in `tybalt_turbo` guaranteeing flags/dates for committed expenses.
- Keep `tybalt` mostly as pass-through.

Pros:

- Single source of truth.
- Cleaner downstream code.

Cons:

- Legacy reporting correctness fully depends on external contract discipline.
- Any Turbo regression can silently impact tybalt unless monitored.

### Option B - Sink contract only (Tybalt-centric)

- Keep Turbo payload as-is.
- In `tybalt`, validate required expense fields before fold; quarantine failures.
- Optionally backfill missing values from existing destination doc during replace.

Pros:

- Reporting safety controlled where reporting runs.
- Strong isolation from Turbo payload drift.

Cons:

- More logic in legacy code.
- Potentially masks upstream quality issues if over-backfilled.

### Option C - Hybrid (RECOMMENDED)

- Enforce source contract in `tybalt_turbo` with tests.
- Also enforce sink contract in `tybalt` with pre-fold validation + quarantine + alerts.
- Keep fold preserve list focused but include reporting-critical fallbacks only when needed.

Pros:

- Best operational safety for Phase 2 cutover.
- Fast detection and containment of regressions.

Cons:

- More implementation work across both repos.

## Required changes before go-live (recommended hybrid checklist)

- [ ] **Prevent fold bypass in Phase 2 path**: Do not allow `Config/Enable.expenses = true` to skip fold during Phase 2 reporting operation.
- [ ] **Add deterministic conflict handling**: Move fold errors to a quarantine collection plus alerting (instead of log-only skip).
- [ ] **Define legacy reporting contract for folded Expenses**: Minimum fields should include `approved`, `committed`, `commitTime`, `committedWeekEnding`, `payPeriodEnding`, `uid`, `date`.
- [ ] **Validate contract pre-fold in tybalt**: Reject/quarantine malformed `TurboExpensesWriteback` rows before writing to `Expenses`.
- [ ] **Harden writeback contract tests in tybalt_turbo**: Add tests for committed-row payload completeness and stable field presence.
- [ ] **Decide preserve strategy explicitly**:
  - strict mode: no preserve of workflow fields (fail fast + quarantine malformed rows), or
  - resilience mode: preserve reporting-critical workflow fields from destination on replace when source omits them.
- [ ] **Protect export paths with metrics**: emit per-run counts for `TurboExpensesWriteback`, folded `Expenses`, MySQL exported rows, and Firestore export-eligible rows.
- [ ] **Run reconciliation before cutover**: compare counts per week/pay period between Turbo source, folded Firestore, and MySQL report datasets.

## UI downloads that are not MySQL-sourced (unchanged)

The following report downloads remain Firestore/export-file based:

- Time Tracking JSON download (`/reports/time/list`)
  - UI: `frontend/src/components/TimeTrackingList.vue:36`
  - Generated from Firestore `TimeTracking` export JSON: `backend/functions/src/timesheets.ts:548`
- Time Tracking CSV download (`/reports/time/list`)
  - UI trigger: `frontend/src/components/TimeTrackingList.vue:45`
  - CSV generated client-side from JSON payload: `frontend/src/components/helpers.ts:242`
- Expense Tracking JSON download (`/reports/expense/list`)
  - UI: `frontend/src/components/ExpenseTrackingList.vue:25`
  - Generated from Firestore `ExpenseTracking` export JSON: `backend/functions/src/expenses.ts:178`

All other report CSV downloads under `/reports` currently go through `queryMySQL`.
