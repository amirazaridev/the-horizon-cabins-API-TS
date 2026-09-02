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
