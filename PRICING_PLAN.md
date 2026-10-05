# Dynamic Pricing — Phase 0 Reconnaissance & Plan

Branch: `feature/dynamic-pricing` (created locally; **nothing is ever pushed**).

## 1. Baseline (before any change)

| Check | Command | Result |
|---|---|---|
| Unit tests | `npm run test:unit` | **167 passed / 167** (6 files) |
| Integration tests | `npm run test:integration` | **101 passed / 101** (4 files) |
| Typecheck | `npx tsc --noEmit` | **1 pre-existing error** (see below) |
| Lint | `npm run lint` | **0 errors, 2 warnings** (`helmet`, `cors` unused in `src/app.ts`) |

Pre-existing typecheck error (not caused by us, left untouched except the required fix in P8):

```
src/utils/booking-price.util.test.ts(3,3): error TS2305:
  Module '"./booking-price.util.js"' has no exported member 'calculateNumNights'.
```

## 2. Environment

- `DATABASE_URL` (`.env`) = `postgresql://postgres:1234@localhost:5432/Horizon_DB` → **local dev DB**, acceptable.
- `.env.test` → `Horizon_DB_test` (guard requires the name to contain "test").
- Prisma 7 CLI loads `prisma7.config.ts` (not `prisma.config.ts`). `prisma migrate status`: 6 migrations, up to date.
- Local Postgres reachable on `localhost:5432`.

## 3. Codebase reality vs. the prompt

| Prompt assumption | Reality in code | Decision |
|---|---|---|
| `HORIZON_CABINS_API_PROJECT_CONTEXT.md` exists | **Does not exist.** Closest file is `PROJECT_OVERVIEW.md`. | Treat `PROJECT_OVERVIEW.md` + real code as the reference; report the missing file. |
| Booking system "exists" (transactions, etc.) | Booking module **is** fully implemented (service/repo/controller/routes/validations/tests). `PROJECT_OVERVIEW.md` is stale (claims bookings unimplemented). | Code is the source of truth. |
| `Booking.totalPrice` is BigInt | It is **`Int`** (changed by migration `20261003182323`). | Keep `Int`; add overflow guard. |
| Layout `src/modules/pricing/...` | Repo uses a **flat** layout (`src/utils`, `src/services`, `src/repositories`, `src/controllers`, `src/routes`, `src/validations`, `src/constants`, `src/types`, `src/jobs`). | Follow the repo convention (rule 3). Files named `pricing.constants.ts` / `pricing.engine.ts` but placed in `src/constants/` and `src/utils/`. Documented decision. |
| `MAX_ADVANCE_BOOKING_DAYS` = 365 | Indeed 365 in `booking.constants.ts`; `BOOKED_DATES_MAX_RANGE_DAYS` = 366. | Change to 120 / set range to 121. |

## 4. Confirmed conventions to reuse

- Layering: `routes → controllers → services → repositories → Prisma`.
- Errors: `AppError(message, statusCode, ErrorCode)`, `ErrorCode` map in `src/constants/errorCodes.ts`, `HTTP_STATUS` in `src/constants/httpStatus.ts`.
- Response envelope: `sendSuccess(res, { data })` → `{ status: "success", data }`; errors → `{ status: "fail", code, message, errors? }`.
- Validation: Zod, wired through `validate(schema)` middleware (`{ body, params, query }`); parsed query lands on `req.parseQuery`.
- Auth: `protect` (JWT cookie) + `restrictTo(...roles)`; `owner` is a separate role and must be added explicitly to every admin check.
- Dates: `todayInTimezone(TIMEZONE, now)`, `addDaysUtc`, `nightsBetween` (`src/utils/date.util.ts`); DB columns are `@db.Date` (UTC-midnight Dates).
- Transactions: `withSerializableRetry` + `prisma.$transaction(..., { isolationLevel: Serializable })`.
- Prisma access only inside repositories.
- Table/column naming: snake_case `@@map` / `@map`.
- Tests: Vitest two-project setup; factories in `tests/helpers/factories.ts`; integration files guarded by `describe.skipIf(!isIntegrationDbAvailable())`.

## 5. Findings to report (outside scope, not silently changed)

1. **Cabin mutation routes are unprotected.** `POST/PATCH/DELETE /cabins` and the cabin-category routes have **no** `protect`/`restrictTo`. Security-critical → will be fixed in P7 (in scope: §9).
2. **Booking-expiration cron is never started.** `startBookingExpirationJob()` is exported but **not** called in `src/server.ts` (only `startOtpCleanupJob()` is). Per §6 we do **not** change it; we report it and only start the new pricing job.
3. **`helmet`/`cors` imported but unused** in `app.ts` (2 lint warnings). Not in scope.
4. **Stale test** `src/utils/booking-price.util.test.ts` imports removed `calculateNumNights` and expects `BigInt` (also has a stale copy in `tests/unit/utils/booking-price.util.test.ts`). Fixed in P5/P8.
5. **Existing `discount` bug**: `cabin.repository.findAllCabins` filters `regularPrice - discount` (absolute subtraction, not percent). Fixed by the new pricing.
6. **Seed inconsistency**: `prisma/seeds/data/cabin.ts` stores absolute amounts (e.g. 1_500_000) in the `discount` percentage column. `discount` is removed entirely.
7. `PROJECT_OVERVIEW.md` is stale (bookings/cities/tests status). Updated in P8.

## 6. Phase plan (see task list)

- **P1** constants + pure engine + validator + unit tests (no DB)
- **P2** Prisma schema, migration (CHECKs + backfills + `discount` removal), seed
- **P3** rule management (repo/service/controller/routes/validation, locking, audit, bulk)
- **P4** calendar builder, daily job (started in `server.ts`), rebuild + `price-calendar` endpoints
- **P5** booking changes + `price-quote` endpoint
- **P6** cabin listing changes
- **P7** cabin hardening + full `discount` removal
- **P8** full test/typecheck/lint + fresh-DB migrate+seed + legacy-DB migration + docs
- **P9** Persian final report

Each phase is committed locally with a clear message.

---

## 7. Final status

All phases P1–P9 are complete on `feature/dynamic-pricing`. Nothing has been
pushed. Final verification (P8):

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **0 errors** |
| Lint | `npx eslint .` | **0 errors, 2 warnings** (pre-existing `helmet`/`cors`) |
| Unit tests | `npx vitest run --config vitest.unit.config.ts` | **227 passed / 227** (10 files) |
| Integration tests | `npx vitest run --config vitest.integration.config.ts` | **175 passed / 175** (9 files) |
| Fresh DB (migrations) | `prisma migrate deploy` on a scratch DB | **7/7 applied cleanly** |
| Fresh DB (seed) | `prisma db seed` | **10 cabins, 3 rules, 1200 calendar rows** |

Baseline at P0 was 167 unit / 101 integration. The pre-existing typecheck error
in `src/utils/booking-price.util.test.ts` was resolved (that stale file was
removed and the canonical test rewritten). The full Persian report is in
`PRICING_IMPLEMENTATION_REPORT.md`.
