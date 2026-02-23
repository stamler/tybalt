# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tybalt is a corporate time tracking, expense management, computer asset management, and reporting application built on Firebase. It uses Azure AD for authentication and syncs data to both MySQL and an external ERP system called "Turbo."

## Repository Structure

- **`frontend/`** — Vue 3 SPA (Vite, TypeScript, Pinia, Vue Router)
- **`backend/functions/`** — Firebase Cloud Functions v1 (the main backend)
- **`backend/functions_v2/`** — Firebase Cloud Functions v2 (newer features: Purchase Orders, AI chat, audit)
- **`backend/firestore/`** — Firestore security rules and indexes
- **`backend/storage/`** — Cloud Storage security rules
- **`config.ts`** — Shared configuration copied into both frontend and backend at build time via prebuild scripts

## Build & Development Commands

### Frontend (`frontend/`)
```bash
npm run dev          # Vite dev server
npm run build        # Type-check (vue-tsc) then Vite build
npm run lint         # ESLint for .ts, .js, .vue files
npm test             # Mocha tests (test/**/*.ts)
```

### Backend Functions v1 (`backend/functions/`)
```bash
npm run build        # Clean + tsc compile (prebuild copies config.ts, postbuild copies .sql files)
npm run lint         # ESLint with --fix
npm test             # Runs mocha inside Firestore emulator with nyc coverage
npm run test_no_coverage   # Emulator tests without coverage
npm run test_no_emulator   # Mocha only (for tests that don't need Firestore)
```

### Backend Functions v2 (`backend/functions_v2/`)
Same scripts as v1.

### Firebase
```bash
firebase emulators:start   # Start all emulators (functions:5001, firestore:8080, hosting:5000, auth:9099)
firebase deploy            # Deploy everything
```

### Running a Single Test
Backend tests use mocha with `test/**/*.ts` glob. Run a specific test file:
```bash
# Without emulator (for tests that don't need Firestore):
cd backend/functions && npx mocha test/someTest.ts

# With emulator:
cd backend/functions && firebase emulators:exec --only firestore 'npx mocha test/someTest.ts'
```

## Architecture

### Shared Config Pattern
`config.ts` at the repo root is the single source of truth for app-wide constants (URLs, tenant IDs, Firebase config). Each package's `prebuild` script copies it into its own `src/` directory. Never edit the copies directly.

### Backend: Domain Module Pattern
`backend/functions/src/index.ts` re-exports named functions from domain modules. Each module (e.g., `timesheets.ts`, `expenses.ts`, `sync.ts`) contains related Cloud Functions. Some Firestore triggers are defined inline in `index.ts` (email triggers, Algolia index updates, computed field writes like `weekEnding`).

Key domain modules in v1:
- `timesheets.ts` — bundling, locking, amendments, export
- `expenses.ts` — expense CRUD, tracking, rates, submit/uncommit
- `sync.ts` — Firestore-to-MySQL sync
- `turboSync.ts` — scheduled ERP writeback
- `mutations.ts` — generic user mutation dispatch/approve queue
- `profiles.ts` — user profiles, MS Graph integration, auth claims
- `jobs.ts` — job management
- `sshMysql.ts` / `sqlQueries.ts` — MySQL integration via SSH tunnel

v2 (`backend/functions_v2/`) handles Purchase Orders (`pos.ts`), AI chat (`ai.ts`), rejection (`rejection.ts`), audit, and immutable ID stamping.

### Frontend: Vue 3 + Pinia + VueFire
- **Router** (`router.ts`): Routes grouped by domain (`/time`, `/expense`, `/reports`, `/admin`, `/ai`, `/presence`, `/me`). Route meta includes `claims` arrays for RBAC.
- **State** (`stores/state.ts`): Single Pinia store holding user, claims, feature flags (`timeEnabled`, `jobsEnabled`, `expensesEnabled`), expense rates, and UI state. Not persisted across reloads.
- **Auth** (`main.ts`): App blocks mounting until `onAuthStateChanged` resolves. Uses Microsoft OAuth via `signInWithRedirect`. On login, syncs profile from MS Graph and validates 7-day freshness.
- **Components**: Domain-specific Vue SFCs in `components/` (e.g., `TimeEntries*.vue`, `Expenses*.vue`, `PO*.vue`). Single `MainView.vue` shell with `ContentShell` wrappers.

### RBAC via Custom Claims
Firestore rules and frontend routing both use Firebase Auth custom claims for access control. Key claims: `time`, `tapr` (time approver), `tame` (time amendments), `eapr` (expense approver), `job`, `hr`, `admin`, `report`, `cor`, `vp`, `smg`, `wg`. Feature flags in `Config/Enable` Firestore doc gate writes to TimeEntries, Expenses, and Jobs.

### Key Firestore Collections
`Profiles`, `Jobs`, `TimeEntries`, `TimeSheets`, `TimeAmendments`, `Expenses`, `PurchaseOrderRequests`, `PurchaseOrders`, `AIChats`, `Divisions`, `TimeTypes`, `TimeTracking`, `ExpenseTracking`, `PayrollTracking`, `Users`, `UserMutations`, `Computers`, `RawLogins`, `WireGuardClients`

## Testing
- Backend: Mocha + Chai + Sinon, with `@firebase/rules-unit-testing` for Firestore rule tests. nyc for coverage.
- Frontend: Mocha + Chai with jsdom-global.
- Backend tests requiring Firestore must run inside the emulator (`npm test`). Tests not needing Firestore can use `npm run test_no_emulator`.

## Tech Stack Notes
- Node 22 for backend functions
- TypeScript throughout
- Frontend uses Sass for styling
- Algolia for search (jobs, profiles, divisions indexes)
- MySQL accessed via SSH tunnel from Cloud Functions
- date-fns for date manipulation (v3 in frontend, v2 in backend)
