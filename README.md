# Edurock API

REST API for **Edurock**, a tuition marketplace for Bangladesh. Students post tuitions, tutors apply, students hire through Stripe, and admins moderate.

**Stack:** Node 20+ · Express 5 · MongoDB (Mongoose 9) · Zod · Firebase Admin (auth) · Stripe · Pino

## Architecture (MVC + services)

```
src/
├── config/        env (Zod-validated), db, firebase, stripe, domain constants
├── models/        Mongoose schemas (Model)
├── validators/    Zod request schemas, one file per resource
├── services/      Business logic: ownership checks, transactions, notifications, caching
├── controllers/   Thin HTTP layer: read req → call service → send envelope (Controller)
├── routes/        Express routers mounted under /api/v1
├── middlewares/   auth/roles, validate, cache, security, errors
├── utils/         ApiError, response envelope, query helpers, logger
├── scripts/       seed, encode-service-key
├── app.js         Express app factory
└── server.js      Local/Render entry (graceful shutdown)
api/index.js       Vercel serverless entry
tests/             Integration tests (node:test + in-memory MongoDB replica set)
```

The request flow is `route → validate (Zod) → authenticate → authorize(role) → controller → service → model`. Any error thrown anywhere ends up in one error handler and comes back in the same shape.

### Response envelope

```json
{ "success": true, "message": "Optional", "data": { }, "meta": { "page": 1, "limit": 12, "total": 40, "totalPages": 4 } }
{ "success": false, "message": "Human readable", "code": "VALIDATION_ERROR", "details": [{ "field": "budget", "message": "…" }], "requestId": "…" }
```

## Getting started

```bash
cp .env.example .env      # MONGODB_URI=mongodb://127.0.0.1:27017, DB_NAME=edurock for a local MongoDB
npm install
npm run seed              # demo accounts + realistic sample data (idempotent)
npm run dev               # http://localhost:3000  (health: /health)
npm test                  # 20 integration tests against an in-memory MongoDB
```

### Demo data (migration seed)

`npm run seed` applies one large, **deterministic** dataset: 38 users (3 demo logins, 24 tutors, 11 students), 48 tuitions in every status, 84 applications, 15 paid bookings, reviews, bookmarks, notifications and contact messages.

- **Same data on every database.** Each document has a fixed `_id` derived from a key, and all variation comes from a seeded random generator. The command prints a checksum, which is also stored in the `_migrations` collection, so you can compare two databases at a glance.
- **Idempotent.** It upserts by `_id`. Re-running it updates in place, never duplicates, and prunes rows from older seed versions. Real (non-seed) data is never touched.
- **Validated first.** Every document is checked against the Mongoose schemas before anything is written.
- Dates are relative to today, so the marketplace always looks fresh. Set `SEED_ANCHOR=2026-10-17` to reproduce exact timestamps.

| Command | What it does |
| --- | --- |
| `npm run seed` | Apply or refresh the dataset |
| `npm run seed:check` | Build and validate only; print counts and checksum without writing |
| `npm run seed:fresh` | Wipe Edurock collections, then seed (refused when `NODE_ENV=production`) |
| `node src/scripts/seed.js --skip-firebase` | Seed without creating or linking Firebase demo logins |

To move to Atlas (or any other database), point `MONGODB_URI` at it and run `npm run seed`. The checksum will match.

`FB_SERVICE_KEY` takes the Firebase service account JSON, either raw or base64. To encode a key file: `node src/scripts/encode-service-key.js ./key.json`.

## API overview (`/api/v1`)

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/sync` (create/refresh profile after Firebase sign-in) · `GET /auth/me` · `POST /auth/demo` |
| Profile | `GET /profile` · `PATCH /profile` |
| Tuitions | `GET /tuitions` (public, filters + pagination) · `GET /tuitions/latest` · `GET /tuitions/:id` · `GET /tuitions/mine` (student) · `GET /tuitions/admin` (admin) · `POST /tuitions` · `PATCH /tuitions/:id` · `PATCH /tuitions/:id/status` (admin) · `DELETE /tuitions/:id` |
| Applications | `POST /applications` (tutor) · `GET /applications/mine` · `GET /applications/ongoing` · `GET /applications/received` (student) · `GET /applications/check/:tuitionId` · `PATCH /applications/:id` · `PATCH /applications/:id/reject` · `DELETE /applications/:id` |
| Payments | `POST /payments/checkout` · `POST /payments/confirm` · `GET /payments` · `POST /payments/webhook` (Stripe) |
| Tutors | `GET /tutors` · `GET /tutors/featured` · `GET /tutors/:id` |
| Reviews | `GET /reviews` · `POST /reviews` |
| Bookmarks | `GET /bookmarks` · `GET /bookmarks/ids` · `POST /bookmarks` · `DELETE /bookmarks/:tuitionId` |
| Notifications | `GET /notifications` · `PATCH /notifications/read-all` · `PATCH /notifications/:id/read` · `DELETE /notifications/:id` |
| Dashboards | `GET /dashboard/student` · `GET /dashboard/tutor` · `GET /dashboard/admin?days=30` |
| Users (admin) | `GET /users` · `PATCH /users/:id/role` · `PATCH /users/:id/verify` · `PATCH /users/:id/status` · `PATCH /users/:id` · `DELETE /users/:id` |
| Meta | `GET /meta/stats` · `GET /meta/subjects` · `GET /meta/locations` · `GET /meta/options` |
| Contact | `POST /contact` · `GET /contact` (admin) · `PATCH /contact/:id` (admin) |
| Live chat | `POST /chat/sessions` (name + phone; returns a token) · `GET /chat/me` · `POST /chat/me/messages` (send `X-Chat-Token`) · admin: `GET /chat/admin/sessions` · `GET`/`POST /chat/admin/sessions/:id[/messages]` · `PATCH /chat/admin/sessions/:id` |

## Security

- **Identity comes from the verified Firebase token, never from the request body.** A role is set once at sign-up, Admin can never be self-assigned, and an existing role is never overwritten by sign-in.
- **Ownership checks** on every mutation: students edit or delete only their own tuitions, tutors only their own applications, and payments are confirmed only by the paying student.
- **Validation:** strict Zod schemas for body, query and params, with type coercion, length limits and enum checks.
- **Injection guards:** `$`/`.` keys are stripped from bodies, regex input is escaped, and `strictQuery` is on.
- **Rate limiting:** a global per-IP limit plus tighter limits for auth, writes and the contact form. The contact form also has a honeypot field.
- **Hardening:** Helmet (locked-down CSP for a JSON API), CORS allow-list, 100 kb body limit, `trust proxy` for correct client IPs.
- **Privacy:** tutor and student contact details are revealed only after a hire.
- **Live chat tokens:** a visitor gets a random 256-bit token when they start a chat. Only its SHA-256 hash is stored, so a database leak cannot be used to read or post into conversations.
- **Suspensions:** suspended accounts are rejected immediately, because the user cache is invalidated on change.

## Performance & caching

- **In-process LRU cache** with namespace versioning: writes invalidate a whole namespace in O(1). It also uses **request coalescing**, so concurrent cache misses share one database query.
- Public GET responses are cached on the server and sent with `Cache-Control: public, max-age, stale-while-revalidate` plus weak ETags for 304s. Authenticated requests are never served from this shared cache.
- Auth lookups (token → user) are cached for 60 s.
- Compound indexes for every list query, `lean()` reads, parallel `Promise.all` aggregations, and gzip compression.
- On Render's free tier the process sleeps when idle and the cache simply warms up again. The cache interface (`get/set/wrap/invalidate`) is small enough to swap for Redis later.

## Payments

1. `POST /payments/checkout` creates a Stripe Checkout Session for a pending application.
2. After paying, the client calls `POST /payments/confirm`. Stripe can also call `POST /payments/webhook` (set `STRIPE_WEBHOOK_SECRET`).
3. Fulfilment runs inside a **MongoDB transaction**: it records the payment (with the platform fee split), approves the application, books the tuition, declines the other applicants and increments the tutor's hire count. A unique index on the session ID makes it **idempotent**: if confirm and webhook race, exactly one payment is recorded.

## Deploying

**Render (recommended):** use the `render.yaml` blueprint at the repo root, or create a Web Service with root `backend`, build `npm ci --omit=dev`, start `npm start` and health check `/health`. Add the environment variables from `.env.example` and set `NODE_ENV=production`.

**Vercel:** set the project root to `backend`. `vercel.json` rewrites every path to `api/index.js`, which exports the Express app. Allow MongoDB Atlas network access from `0.0.0.0/0`.

## Demo accounts

`npm run seed` creates Firebase users `demo.student@etuition.com`, `demo.tutor@etuition.com` and `demo.admin@etuition.com`. The site's "Try a demo account" buttons sign in through short-lived custom tokens, so no passwords are involved.
