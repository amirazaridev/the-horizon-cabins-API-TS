# The Horizon Cabins API — Project Overview

## 1. Project Description

The Horizon Cabins API is a RESTful backend for a cabin booking platform (targeting the Iranian market). It provides endpoints for browsing cabins, managing categories, user authentication, and administrative operations. The project is built with Express.js and TypeScript, using a layered architecture (routes → controllers → services → repositories) backed by Prisma ORM with PostgreSQL.

**Current Stage:** Partially implemented. Core modules (auth, cabins, categories, users) are functional. The booking system, guest management, and settings module are defined in the database schema but have no application-layer implementation yet.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js >= 21 (ESM) |
| Framework | Express 5 |
| Language | TypeScript 6 (strict mode) |
| ORM | Prisma 7 with `@prisma/adapter-pg` driver adapter |
| Database | PostgreSQL |
| Validation | Zod 4 |
| Authentication | JWT (httpOnly cookie) + bcrypt |
| File Upload | Multer (memory storage) → Supabase Storage |
| Logging | Winston |
| Linting | ESLint + Prettier |

---

## 3. Architecture

```
src/
├── app.ts                  # Express app factory
├── server.ts               # Entry point with graceful shutdown
├── config/                 # env, database, logger
├── constants/              # error codes, HTTP status, icons, upload config
├── controllers/            # Request/response handling
├── services/               # Business logic
├── repositories/           # Database access layer
├── middlewares/            # auth, validation, error handling, pagination, upload
├── routes/                 # API endpoint definitions
├── types/                  # Shared TypeScript types
├── utils/                  # Helpers (JWT, password, pagination, upload, etc.)
├── validations/            # Zod schemas
└── generated/prisma/       # Auto-generated Prisma client (do not edit)
```

**Request Flow:**
```
Request → Middleware (auth/validate/pagination) → Route → Controller → Service → Repository → Database
```

---

## 4. Database Schema

### 4.1 Enums

| Enum | Values |
|------|--------|
| `UserRole` | `admin`, `owner`, `guest` |
| `Gender` | `male`, `female` |
| `BookingStatus` | `confirmed`, `checkedIn`, `checkedOut` |

### 4.2 Models

#### User
| Field | Type | Notes |
|-------|------|-------|
| id | Int (PK) | Auto-increment |
| email | String(100) | Unique |
| password | String(255) | Hashed, omitted from client by default |
| role | UserRole | Default: `guest` |
| active | Boolean | Default: `true` |
| lastPasswordChange | DateTime | Default: `now()` |
| loginAttempts | Int | Default: `0` |
| lastLoginAttempt | DateTime? | Nullable |
| lockedUntil | DateTime? | Nullable — account lockout |
| guest | Guest? | 1:1 relation |
| createdAt / updatedAt | DateTime | Timestamps |

#### Guest
| Field | Type | Notes |
|-------|------|-------|
| id | Int (PK) | Auto-increment |
| userId | Int (FK → User) | Unique, cascade delete |
| fullName | String(100) | |
| phoneNumber | String(15)? | Nullable |
| nationalId | String(20)? | Unique, nullable |
| dateOfBirth | Date? | Nullable |
| gender | Gender? | Nullable |
| bookings | Booking[] | 1:N relation |

#### City
| Field | Type | Notes |
|-------|------|-------|
| id | Int (PK) | Auto-increment |
| name | String(100) | Unique |
| cabins | Cabin[] | 1:N relation |

#### Cabin
| Field | Type | Notes |
|-------|------|-------|
| id | Int (PK) | Auto-increment |
| name | String | Unique |
| maxCapacity | Int | |
| regularPrice | Int | Base nightly price (Toman). Drives the dynamic pricing engine |
| description | String | |
| amenities | String[] | PostgreSQL array |
| bedrooms | Int | |
| bathrooms | Int | |
| areaSqm | Float | |
| images | String[] | Supabase Storage URLs |
| latitude / longitude | Float | |
| rating | Float | Default: `0` |
| cityId | Int (FK → City) | Restrict delete |
| categories | CabinCategory[] | M:N via join table |
| bookings | Booking[] | 1:N relation |

#### Category
| Field | Type | Notes |
|-------|------|-------|
| id | Int (PK) | Auto-increment |
| title | String(100) | Unique |
| slug | String(100) | Unique, kebab-case |
| icon | String(50) | Validated against allowed list |
| displayOrder | Int | Default: `0` |
| cabins | CabinCategory[] | M:N via join table |

#### CabinCategory (Join Table)
| Field | Type | Notes |
|-------|------|-------|
| cabinId | Int (FK → Cabin) | Composite PK, cascade delete |
| categoryId | Int (FK → Category) | Composite PK, cascade delete |

#### Booking
| Field | Type | Notes |
|-------|------|-------|
| id | Int (PK) | Auto-increment |
| startDate | DateTime | `@db.Date` (UTC midnight) |
| endDate | DateTime | `@db.Date` (UTC midnight) |
| numNights | Int | |
| numGuests | Int | |
| cabinPrice | Int | **Subtotal** = SUM of nightly final prices (no extras) |
| extrasPrice | Int | Default: `0` |
| totalPrice | Int | Frozen snapshot of the quoted total |
| status | BookingStatus | Default: `pending` |
| cancelledAt / cancellationReason | DateTime? / CancellationReason? | |
| observations | Text? | Nullable |
| cabinId | Int (FK → Cabin) | Restrict delete |
| guestId | Int (FK → Guest) | Restrict delete |
| nights | BookingNight[] | Immutable per-night price snapshot |
| createdAt / updatedAt | DateTime | |

#### PriceRule (Dynamic Pricing)
| Field | Type | Notes |
|-------|------|-------|
| id | Int (PK) | Auto-increment |
| cabinId | Int (FK → Cabin) | Cascade delete |
| type | PriceRuleType | `discount` \| `surcharge` |
| kind | PriceRuleKind | `date_range` \| `weekday` |
| percent | Int | 1..50 (CHECK enforced) |
| startDate / endDate | DateTime? | Required for `date_range` |
| weekdays | Int[] | ISO 1..7, required for `weekday` |
| label | String? | |
| isActive | Boolean | Default: `true` |
| createdById / updatedById | Int (FK → User) | |

#### CabinDailyPrice (Materialized read model)
| Field | Type | Notes |
|-------|------|-------|
| cabinId + date | Composite PK | |
| basePrice | Int | Cabin `regularPrice` at build time |
| discountPercent / surchargePercent | Int | Applied rule totals |
| finalPrice | Int | Result of the pricing engine |
| updatedAt | DateTime | |

#### BookingNight (Immutable snapshot)
| Field | Type | Notes |
|-------|------|-------|
| bookingId + date | Composite PK | |
| basePrice | Int | |
| discountPercent / surchargePercent | Int | |
| finalPrice | Int | |

#### PriceRuleAudit
| Field | Type | Notes |
|-------|------|-------|
| id | Int (PK) | Auto-increment |
| cabinId / ruleId | Int | History survives rule deletion |
| action | PriceRuleAuditAction | created/updated/activated/deactivated/deleted |
| snapshot | Json | Rule state at the time of the action |
| actorId | Int (FK → User)? | |

#### Setting
| Field | Type | Notes |
|-------|------|-------|
| id | Int (PK) | Auto-increment |
| minBookingLength | Int | Default: `1` |
| maxBookingLength | Int | Default: `30` |
| maxGuests | Int | Default: `10` |
| breakfastPrice | Int | Default: `15` |

---

## 5. Implemented Features

### 5.1 Authentication Module (Complete)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/auth/signup` | Public | Create account (User + Guest) |
| POST | `/api/v1/auth/login` | Public | Login with lockout protection |
| POST | `/api/v1/auth/logout` | Public | Clear JWT cookie |

**Features:**
- JWT stored in httpOnly cookie
- Account lockout after configurable failed attempts
- Password change invalidates existing tokens
- Prisma extension auto-hashes passwords on create/update

### 5.2 User Module (Complete)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/user/me` | Protected | Get current user profile (includes guest data) |

### 5.3 Category Module (Complete)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/categories` | Public | List all categories (with cabin count) |
| POST | `/api/v1/categories` | Admin | Create category |
| GET | `/api/v1/categories/:id` | Public | Get category by ID |
| PATCH | `/api/v1/categories/:id` | Admin | Update category |
| DELETE | `/api/v1/categories/:id` | Admin | Delete category (blocked if linked to cabins) |

### 5.4 Cabin Module (Complete)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/cabins` | Public | List cabins (paginated, filterable by city/guests/bedrooms/amenities/price/category/dates) |
| POST | `/api/v1/cabins` | admin\|owner | Create cabin (with image upload to Supabase) |
| GET | `/api/v1/cabins/cities` | Public | List all cities |
| GET | `/api/v1/cabins/amenities` | Public | List all amenities |
| GET | `/api/v1/cabins/:id` | Public | Get cabin by ID |
| PATCH | `/api/v1/cabins/:id` | admin\|owner | Update cabin |
| DELETE | `/api/v1/cabins/:id` | admin\|owner | Delete cabin |
| GET | `/api/v1/cabins/:id/categories` | Public | Get cabin's categories |
| POST | `/api/v1/cabins/:id/categories` | admin\|owner | Set cabin's categories (replace) |
| DELETE | `/api/v1/cabins/:id/categories/:categoryId` | admin\|owner | Remove category from cabin |
| GET | `/api/v1/cabins/:cabinId/price-quote` | Public | Quote a stay price for a date range |
| GET | `/api/v1/cabins/:cabinId/price-calendar` | Public | Cabin daily price calendar |

**Features:**
- Image upload to Supabase Storage (JPEG/PNG/WebP/AVIF, max 5MB, max 10 files)
- Dynamic filtering with query parameters
- Pagination with metadata
- Regular price range validation (`MIN_REGULAR_PRICE`..`MAX_REGULAR_PRICE`)
- Category assignment via transaction

### 5.4b Dynamic Pricing Module (Complete)

A pure pricing engine (`src/utils/pricing.engine.ts`) is the single source of
truth: for each night it collects the active rules, applies stacking limits and
combines them multiplicatively
(`final = floor(base * (100 + S) * (100 - D) / 10000)`), never using floats.
Results are materialized into `cabin_daily_prices` (a 120-night rolling window)
by the calendar builder and refreshed nightly by a job.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/cabins/:cabinId/price-rules` | admin\|owner | List a cabin's price rules |
| POST | `/api/v1/cabins/:cabinId/price-rules` | admin\|owner | Create a price rule |
| PATCH | `/api/v1/price-rules/:id` | admin\|owner | Update a rule (optimistic) |
| DELETE | `/api/v1/price-rules/:id` | admin\|owner | Soft-delete a rule |
| POST | `/api/v1/price-rules/bulk` | admin\|owner | Bulk create/update rules |
| GET | `/api/v1/cabins/:cabinId/price-calendar` | Public | Daily price calendar |
| GET | `/api/v1/cabins/:cabinId/price-quote` | Public | Quote a stay for a date range |
| POST | `/api/v1/price-calendar/rebuild` | owner | Rebuild calendars on demand |

**Key rules:** discounts ≤ 50% summed, surcharges ≤ 50% summed, at most 2 rules
of each type per night; nightly price bounded by `MAX_NIGHTLY_PRICE`, regular
price by `MAX_REGULAR_PRICE`; booking horizon capped at
`MAX_ADVANCE_BOOKING_DAYS` (120).

### 5.5 Middleware Stack

| Middleware | Purpose |
|------------|---------|
| `protect` | JWT verification from cookie |
| `restrictTo(...roles)` | Role-based access control |
| `validate(schema)` | Zod body/params/query validation |
| `paginationMiddleware` | Extract pagination from query string |
| `uploadCabinImages` | Multer file upload handling |
| `errorHandler` | Centralized error handling (AppError, Zod, Prisma, JWT, Multer) |
| `notFoundHandler` | 404 for undefined routes |

---

## 6. Unimplemented / Incomplete Sections

### 6.1 Booking System (Implemented)

The Booking module is fully implemented: routes, controller, service, repository
and validations all exist, backed by serializable transactions, an exclusion
constraint for overlapping stays, a 30-minute pending expiry job, and the
dynamic pricing engine. Availability, nightly pricing and status transitions
(pending → confirmed → checkedIn → checkedOut / cancelled) are all in place.

> Note: the only out-of-scope pitfall found is that `startBookingExpirationJob()`
> is exported but **not** started in `src/server.ts` (only `startOtpCleanupJob`
> and `startPriceCalendarJob` are). This was left untouched by the dynamic
> pricing work and is reported in `PRICING_IMPLEMENTATION_REPORT.md`.
- Payment integration

### 6.2 Guest Module (Partially Implemented)

- `src/services/guest.service.ts` — **Empty file** (0 lines of code)
- `src/repositories/guest.repository.ts` — Only has `createGuest` and `findGuestByUserId`
- No guest routes or controller

**Needed:**
- Guest profile update endpoint
- Guest booking history
- Full CRUD operations

### 6.3 Settings Module (Commented Out)

- `src/repositories/setting.repository.ts` — **Entirely commented out**
- No settings routes, controller, or service

**Needed:**
- Settings CRUD (min/max booking length, max guests, breakfast price)
- Integration with booking validation logic

### 6.4 City Module (No Dedicated Routes)

The `City` model exists and is used for cabin filtering, but there are no standalone city management endpoints (create/update/delete cities). Cities are only seeded.

### 6.5 Tests (Vitest)

Vitest runs in two projects: `unit` (`vitest.unit.config.ts`, no DB, fast) and
`integration` (`vitest.integration.config.ts`, real Postgres on `Horizon_DB_test`).
Run them with `npm run test:unit` and `npm run test:integration`. See `TESTING.md`
for the suite breakdown.

No CI/CD pipeline is configured.

### 6.6 Docker / Deployment (None)

- No Dockerfile
- No docker-compose.yml
- No deployment configuration

### 6.7 Security Hardening (Incomplete)

- `helmet` and `cors` are imported in `app.ts` but **commented out**
- No rate limiting (beyond login lockout)
- No request sanitization middleware

---

## 7. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `development` or `production` |
| `PORT` | Yes | Server port (default: 3001) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `BCRYPT_SALT_ROUNDS` | No | Default: `10` (min: 9, max: 15) |
| `MAX_LOGIN_ATTEMPTS` | No | Default: `5` |
| `LOCK_DURATION_MS` | No | Default: `120000` (2 minutes) |
| `JWT_SECRET` | Yes | JWT signing secret |
| `JWT_EXPIRES_IN` | No | Default: `120000` (seconds) |
| `JWT_COOKIE_EXPIRES_IN_MS` | No | Default: `120000` |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `SUPABASE_BUCKET_CABINS` | No | Default: `cabins_images` |

---

## 8. Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm run lint` | Run ESLint |
| `npm run format` | Run Prettier on `src/` |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:reset-migrate` | Reset database and re-run migrations |

---

## 9. Seed Data

The seed system (`prisma/seed.ts`) populates:
- **9 cities** in Iran (Noshahr, Ramsar, Kelardasht, Masal, Mahmudabad, Noor, Chalus, Babolsar, Siahkal)
- **10 categories** (Cabin, Villa, Apartment, Traditional House, Forest Villa, Luxury Stay, Swiss Cabin, Seaside, With Pool, Rural House)
- **10 cabins** with full details (Persian descriptions, amenities, Supabase image URLs, coordinates, pricing)
- **20 cabin-category** relationships

---

## 10. Project Status Summary

| Module | Status |
|--------|--------|
| Auth (login/signup/logout) | Complete |
| User profile | Complete |
| Categories CRUD | Complete |
| Cabins CRUD + images | Complete |
| Database schema | Complete (all models defined) |
| Migrations | Complete (2 migrations applied) |
| Seed data | Complete |
| Booking system | Not started (schema only) |
| Guest management | Incomplete (empty service) |
| Settings | Not started (commented out) |
| Tests | Not started |
| Docker | Not started |
| Security headers/CORS | Inactive (commented out) |
