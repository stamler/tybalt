# Phase 3 Time Writeback Staging

## Scope
This document covers the Turbo-to-Firestore staging work in [`backend/functions/src/turboSync.ts`](/Users/dean/code/tybalt/backend/functions/src/turboSync.ts) for Phase 3 time writeback.

The goal is to keep using `TurboTimeSheetsWriteback`, add `TurboTimeAmendmentsWriteback`, and stage the structured Turbo response from:

```ts
{
  timeSheets: [...],
  timeAmendments: [...]
}
```

This phase does not fold into legacy `TimeSheets` / `TimeAmendments`, does not touch [`backend/functions/src/sync.ts`](/Users/dean/code/tybalt/backend/functions/src/sync.ts), and does not change MySQL export behavior.

## Implemented Behavior
The scheduled function name remains `scheduledTurboTimeSheetsWritebackSync` to avoid a Cloud Function rename. Its behavior now stages both time sheets and time amendments.

`fetchAndSyncTimeSheetsWriteback()` now treats the requested week window as a full snapshot:
- all requested weeks are fetched in parallel
- every response must validate as an object with `timeSheets` and `timeAmendments` arrays
- if any fetch fails or any response is malformed, the run aborts before clearing or rewriting staging
- once all weeks validate, both staging collections are cleared and rewritten from the aggregated snapshot
- a valid but empty snapshot still clears both collections

## Firestore Staging Collections
- `TurboTimeSheetsWriteback`
- `TurboTimeAmendmentsWriteback`

Both collections use the Turbo row `id` as the Firestore document ID. Staging preserves Turbo field names exactly.

## Date Normalization
Before staging, `turboSync.ts` normalizes date fields to Firestore `Timestamp` values:

### `timeSheets`
- top-level `weekEnding`: end-of-day in `APP_NATIVE_TZ`
- `entries[].weekEnding`: end-of-day in `APP_NATIVE_TZ`
- `entries[].date`: noon in `APP_NATIVE_TZ`

### `timeAmendments`
- `weekEnding`: end-of-day in `APP_NATIVE_TZ`
- `committedWeekEnding`: end-of-day in `APP_NATIVE_TZ`
- `date`: noon in `APP_NATIVE_TZ`
- `committed`: parsed from ISO datetime to Firestore `Timestamp`

Other string, number, boolean, and nested payload fields are staged unchanged.

## Test Coverage
[`backend/functions/test/turboSync.test.ts`](/Users/dean/code/tybalt/backend/functions/test/turboSync.test.ts) covers:
- valid structured responses with writes to both staging collections
- date normalization for time sheets and time amendments
- malformed response rejection when one array is missing
- fail-fast behavior when one requested week errors
- empty but valid four-week snapshots clearing both collections

## Manual Smoke Checks
After deploy:
- confirm `TurboTimeSheetsWriteback` receives staged docs
- confirm `TurboTimeAmendmentsWriteback` receives staged docs
- confirm a deleted/vanished Turbo record disappears from staging on the next successful snapshot
- confirm logs show per-week fetch counts plus final write counts for both collections
