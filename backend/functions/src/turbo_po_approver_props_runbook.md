# Legacy TurboPoApproverProps Runbook

## Purpose

Define operational steps for syncing Turbo `po_approver_props` data through legacy Tybalt.

## Components

- Firestore collection: `TurboPoApproverProps`
- MySQL table: `TurboPoApproverProps`
- Pull path: `fetchAndSyncExpensesWriteback()` in `turboSync.ts`
- Export path: `exportTurboPoApproverProps()` in `sync.ts`

## Rollout Order

1. Deploy Turbo endpoint support for `poApproverProps`.
2. Deploy legacy `turboSync.ts` update (Firestore staging).
3. Ensure MySQL table exists (`TurboPoApproverProps`).
4. Deploy legacy `sync.ts` update (MySQL export).
5. Run `import_data --export --import --users` in Turbo environment.

## Fast-Fail Validation

`exportTurboPoApproverProps()` fails export when any row has:

- missing/blank `uid`
- non-numeric required limit field
- invalid `divisions` JSON
- missing `created` or `updated`

## Smoke Checks

1. Firestore: `TurboPoApproverProps` docs appear after scheduled expenses writeback sync.
2. MySQL: row count in `TurboPoApproverProps` increases and stale cleanup executes.
3. Logs: no fast-fail validation errors for required fields.
