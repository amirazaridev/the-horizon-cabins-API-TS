## Cabin Booking API

A RESTful backend for a cabin booking platform, built with **Express.js** and **TypeScript**. Features JWT-based authentication with account lockout protection, role-based access control (admin/owner/guest), and a layered architecture (controllers → services → repositories) backed by **Prisma ORM** with PostgreSQL.

### Tech Stack
- **Runtime:** Node.js (ESM)
- **Framework:** Express 5
- **Language:** TypeScript (strict mode)
- **ORM:** Prisma 7 (with `@prisma/adapter-pg` driver adapter)
- **Validation:** Zod
- **Auth:** JWT + bcrypt, with login-attempt rate limiting

### Architecture
```
src/
  routes/         → API endpoints
  controllers/    → request/response handling
  services/       → business logic
  repositories/   → database access layer
  middlewares/    → auth, validation
  validations/    → Zod schemas
```

### Running the API
```bash
npm install
npm run prisma:generate
npm run dev
```

---

## Testing

Tests live in `tests/` and are split into two independent Vitest projects:

| Project | Contains | Needs a database? | Script |
| --- | --- | --- | --- |
| **unit** | services (mocked repos), utils, validations | No | `npm run test:unit` |
| **integration** | repositories, HTTP routes (supertest), jobs | Yes (test DB) | `npm run test:integration` |

### Scripts

```bash
npm run test               # unit (fast, no DB)
npm run test:unit          # unit
npm run test:integration   # integration (test DB)
npm run test:watch         # unit in watch mode
npm run test:coverage      # unit + coverage report
npm run test:db:setup      # create the test database (one-time)
```

### Test structure
```
tests/
  setup/            → env loading, global setup, DB guard, test-DB creation script
  helpers/          → factories (user/cabin/booking), auth cookie, DB reset, integration gate
  unit/
    services/       → booking.service.test.ts (repositories mocked)
    utils/          → date, booking-price, booking, transaction
    validations/    → booking.validation.test.ts
  integration/
    services/       → booking.concurrency.test.ts (real DB, parallel creates)
    repositories/   → booking.repository.test.ts (real DB)
    routes/         → booking.routes.test.ts (supertest)
    jobs/           → booking-expiration.test.ts
```

### Integration test database setup

Integration tests run against a **separate** PostgreSQL database whose name must
contain `test`. They will refuse to run against `Horizon_DB` (the dev DB) —
`tests/setup/db-guard.ts` hard-fails if the database name does not contain
`test`, because the cleanup step `TRUNCATE ... CASCADE` is destructive.

1. Create the database (reads `DATABASE_URL` from `.env.test`):
   ```bash
   npm run test:db:setup
   ```
   Or manually:
   ```bash
   psql -h localhost -U postgres -c 'CREATE DATABASE "Horizon_DB_test";'
   ```
2. Apply migrations. This happens **automatically** in the integration
   `globalSetup` via `prisma migrate deploy`, or run it yourself:
   ```bash
   DATABASE_URL="postgresql://postgres:1234@localhost:5432/Horizon_DB_test?schema=public" \
     npx prisma migrate deploy
   ```
3. Run:
   ```bash
   npm run test:integration
   ```

The test database connection string lives in `.env.test` (committed, contains
no real secrets). Data is wiped with `TRUNCATE ... RESTART IDENTITY CASCADE`
before each integration test file, so tests are independent of run order.

> **If the test database is unavailable**, the integration suite reports a clear
> warning and **skips** its tests instead of failing — the unit suite is
> unaffected.

