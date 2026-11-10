# Nest Shop API

[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)](.github/workflows/ci.yml)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?logo=postgresql&logoColor=white)
![Node](https://img.shields.io/badge/Node-%E2%89%A5%2020-339933?logo=nodedotjs&logoColor=white)

A REST API for an online shop, built with **NestJS, TypeORM and PostgreSQL**.
It started as a learning project (users, products, reviews) and grew into a complete
back end: email-verified accounts, Google sign-in, categories, stock, a shopping cart,
and orders with a **checkout that is safe under concurrent requests** (no overselling,
no double orders, no lost updates).

---

## Table of contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Quick start](#quick-start)
4. [Configuration](#configuration)
5. [Database and migrations](#database-and-migrations)
6. [API reference](#api-reference)
7. [How orders and checkout work](#how-orders-and-checkout-work)
8. [Data model](#data-model)
9. [Security](#security)
10. [Testing](#testing)
11. [npm scripts](#npm-scripts)
12. [Project structure](#project-structure)
13. [Deployment notes](#deployment-notes)
14. [Troubleshooting](#troubleshooting)
15. [Known limitations](#known-limitations)

---

## Features

| Area              | What you get                                                                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**          | Register with email verification by a 6-digit **OTP** (SMTP + Redis), JWT login, forgot / reset password by OTP, change password, Google OAuth 2.0                                                                              |
| **Users**         | Profile, update username, delete account (owner or admin), profile image on Cloudinary, roles `admin` / `user`                                                                                                                  |
| **Categories**    | CRUD (admin only), unique names                                                                                                                                                                                                 |
| **Products**      | CRUD (admin only), stock, category, case-insensitive search, price filters, sorting, pagination with an `X-Total-Count` header                                                                                                  |
| **Images**        | Up to 8 images per product on **Cloudinary** (admin), kept in order; files are deleted from Cloudinary with the image / product                                                                                                 |
| **Reviews**       | Rating 1–5 with a comment, **one review per user per product**; products show `ratingAverage` and `reviewsCount`; paginated list                                                                                                |
| **Wishlist**      | Save / remove products, paginated list, saving twice is harmless                                                                                                                                                                |
| **Coupons**       | Percentage or fixed coupons (admin), minimum cart, cap, validity dates, usage limit; the limit can never be passed concurrently                                                                                                 |
| **Cart**          | Add / change / remove / clear; adding is a single atomic statement                                                                                                                                                              |
| **Orders**        | Checkout from the cart (with an optional coupon), cancel (stock and coupon use are returned), status flow, "my orders", admin list                                                                                              |
| **Sessions**      | Short-lived access token + **refresh token in an httpOnly cookie**, rotated on every refresh, with reuse detection (a replayed token revokes the whole session family), logout, and "sign out other devices" on password change |
| **Audit log**     | Every admin change (products, categories, coupons, order status/cancel, review moderation, user deletion) is recorded in the same transaction with who, what, before/after and IP (`GET /audit-logs`, admin)                    |
| **Notifications** | In-app notifications for order events (customer) and new orders / low stock (admins); order notifications are also e-mailed after the transaction commits                                                                       |
| **Analytics**     | `GET /analytics/dashboard` (admin): users, products, stock, orders by status, revenue, top sellers, ratings; cached in Redis and invalidated on change                                                                          |
| **Uploads**       | Image upload to disk (png, jpg, gif, webp, 5 MB, login required)                                                                                                                                                                |
| **Ops**           | `GET /api/health`, Swagger UI at `/swagger`, env validation, rate limiting, Helmet, CORS, one error format, access log                                                                                                          |

## Tech stack

- **Runtime / framework:** Node.js ≥ 20, NestJS 11 (Express 5), TypeScript
- **Database:** PostgreSQL (tested on 16) through TypeORM, schema managed only by migrations
- **Auth:** `@nestjs/jwt`, `passport-google-oauth20`, `bcryptjs`
- **Validation / docs:** `class-validator`, `class-transformer`, `@nestjs/swagger`
- **Email:** `@nestjs-modules/mailer` + EJS templates (nodemailer)
- **Images:** Cloudinary (profile images), Multer (disk uploads)
- **Protection:** `@nestjs/throttler`, `helmet`
- **Tests:** Jest (unit) and Jest + Supertest (end-to-end on real PostgreSQL and a real SMTP sink)

---

## Quick start

### Prerequisites

- Node.js 20 or newer
- PostgreSQL 14 or newer, installed locally or hosted (for example Neon)
- An SMTP account (for example a free [Mailtrap](https://mailtrap.io) sandbox), a Google OAuth client and a Cloudinary account — see [Configuration](#configuration)

### 1. Install

```bash
git clone <your-repo-url> nest-shop-api
cd nest-shop-api
npm install
```

### 2. Create the databases

Create an empty PostgreSQL database for development (for example `nest_shop`) and use its URL as
`DATABASE_URL` in the next step. For the e2e tests create a second, throw-away one named like `nest_e2e`:

```bash
createdb nest_shop
createdb nest_e2e
```

### 3. Configure

```bash
cp .env.example .env.development     # then fill in the values
```

Which file is read: `NODE_ENV=production` → `.env`, anything else → `.env.<NODE_ENV>`
(`.env.development` by default). **Redis** is required (it keeps the one-time codes). A variable that is already set in the real environment
always wins over the file. The app refuses to start, with a clear message, if a required
variable is missing.

### 4. Create the tables

```bash
npm run migration:run
```

### 5. Run

```bash
npm run start:dev                          # development, watch mode
# or
npm run build && npm run start:prod        # production (reads .env)
```

The API is now on `http://localhost:3000`:

| URL                                | What                          |
| ---------------------------------- | ----------------------------- |
| `http://localhost:3000/api/health` | `{ "status": "ok", ... }`     |
| `http://localhost:3000/swagger`    | Interactive API documentation |

### 6. Make your first admin

Accounts are always created as `user`. There is intentionally no public endpoint that
creates admins, so promote one account in the database after it has registered and verified
its email:

```sql
UPDATE users SET "userType" = 'admin' WHERE email = 'you@example.com';
```

Then log in again to get a token (the role is also re-read from the database on every
request, so old tokens follow the change immediately).

### Try it

```bash
# 1) register (a 6-digit code is emailed), verify it, then log in
curl -X POST localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"sara@example.com","password":"secret123","username":"Sara"}'

curl -X POST localhost:3000/api/v1/auth/verify-email \
  -H 'Content-Type: application/json' \
  -d '{"email":"sara@example.com","otp":"048213"}'

curl -X POST localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"sara@example.com","password":"secret123"}'
# -> { "success": true, "data": { "accessToken": "eyJ...", "expiresIn": 900 } }  (+ refresh_token cookie)

# 2) browse products (public)
curl 'localhost:3000/api/v1/products?title=phone&minPrice=100&sortBy=price&sortOrder=ASC&limit=5'

# 3) cart -> checkout
TOKEN=eyJ...
curl -X POST localhost:3000/api/cart -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"productId":1,"quantity":2}'

curl -X POST localhost:3000/api/orders -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"shippingAddress":"12 Nile St, Mansoura, Egypt"}'
```

Ready-made requests for every endpoint are in [`rest_client/*.http`](rest_client)
(VS Code **REST Client** extension).

---

## Configuration

All variables below are **required** unless marked optional.

| Variable                      | Example                                              | Notes                                                                                                                   |
| ----------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                | `postgres://user:password@localhost:5432/nest_shop`  | Add `?sslmode=require` for hosted databases such as Neon                                                                |
| `DOMAIN`                      | `http://localhost:3000`                              | Public URL of the API; used as the Swagger server                                                                       |
| `JWT_ACCESS_SECRET`           | 96 random hex characters (min 32)                    | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`                                              |
| `JWT_REFRESH_SECRET`          | 96 random hex characters (min 32)                    | **New.** Must differ from `JWT_ACCESS_SECRET`                                                                           |
| `JWT_REFRESH_EXPIRES_IN`      | `7d`                                                 | _Optional._ Lifetime of the refresh token (and of its cookie). Default `7d`                                             |
| `EMAIL_NOTIFICATIONS_ENABLED` | `true`                                               | _Optional._ `false` turns off the e-mail copy of notifications (OTP e-mails stay). Default `true`                       |
| `FRONTEND_URL`                | `https://shop.example.com`                           | _Optional._ Link of the button in notification e-mails (no button when unset)                                           |
| `JWT_ACCESS_EXPIRES_IN`       | `15m`                                                | _Optional._ A number + `s`, `m`, `h` or `d` (`15m`, `7d`...). Default `15m` (was `1d` before refresh tokens)            |
| `OTP_SECRET`                  | 96 random hex characters (min 32)                    | Key used to hash the one-time codes stored in Redis                                                                     |
| `REDIS_HOST`                  | `localhost`                                          | Redis keeps the one-time codes (10 min, 5 attempts, 60 s between two codes)                                             |
| `REDIS_PORT`                  | `6379`                                               | _Optional._ Default `6379`                                                                                              |
| `REDIS_PASSWORD`              | `...`                                                | _Optional._                                                                                                             |
| `SMTP_HOST`                   | `sandbox.smtp.mailtrap.io`                           | Port 465 uses TLS, any other port uses STARTTLS                                                                         |
| `SMTP_PORT`                   | `587`                                                |                                                                                                                         |
| `SMTP_USERNAME`               | `you@example.com`                                    | _Optional_ (no login when empty). Also the default sender address                                                       |
| `SMTP_PASSWORD`               | `...`                                                | _Optional._                                                                                                             |
| `GOOGLE_CLIENT_ID`            | `...apps.googleusercontent.com`                      | Google Cloud Console → Credentials → OAuth client                                                                       |
| `GOOGLE_CLIENT_SECRET`        | `...`                                                |                                                                                                                         |
| `GOOGLE_CALLBACK_URL`         | `http://localhost:3000/api/v1/auth/google/callback`  | Must be listed as an authorised redirect URI in Google Console                                                          |
| `CLOUDINARY_CLOUD_NAME`       | `...`                                                | Used for profile images and product images                                                                              |
| `CLOUDINARY_API_KEY`          | `...`                                                |                                                                                                                         |
| `CLOUDINARY_API_SECRET`       | `...`                                                |                                                                                                                         |
| `PORT`                        | `3000`                                               | _Optional._ Default `3000`                                                                                              |
| `MAIL_FROM`                   | `"Shop" <no-reply@example.com>`                      | _Optional._ Default `"Nest JS" <SMTP_USERNAME>`                                                                         |
| `THROTTLE_LIMIT`              | `100`                                                | _Optional._ Requests per minute per IP for the whole API                                                                |
| `THROTTLE_DISABLED`           | `false`                                              | _Optional._ `true` turns the rate limit off (tests)                                                                     |
| `CORS_ORIGINS`                | `https://shop.example.com,https://admin.example.com` | _Optional._ Front-end origins allowed by CORS. Unset: open in development, **closed in production**                     |
| `TRUST_PROXY`                 | `1`                                                  | _Optional._ Number of reverse proxies in front of the app (Vercel, Nginx...), so the rate limit sees the real client IP |

The variables are validated with **Zod** (`src/config/env.validation.ts`) when the app starts.

> **Never commit real `.env` files.** They are in `.gitignore`; only `.env.example` belongs in git.

---

## Database and migrations

The schema is created **only by migrations** (`synchronize` is off). The migration CLI reads
the same env file as the application (see [Configuration](#configuration)).

```bash
npm run migration:run        # apply pending migrations
npm run migration:revert     # undo the last one
npm run migration:generate -- db/migrations/MyChange   # after changing an entity
```

Against a production database, point the CLI at it explicitly:

```bash
npx cross-env NODE_ENV=production npm run migration:run
# or simply: DATABASE_URL=postgres://... npm run migration:run
```

| Migration                               | What it does                                                                                                                                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1788961697843-initial`                 | `users`, `products`, `reviews`                                                                                                                                                                      |
| `1789063903065-initial`                 | Google sign-in: `users.googleId`, password becomes nullable                                                                                                                                         |
| `1793918224019-Final`                   | Shop tables (`categories`, `cart_items`, `orders`, `order_items`), `stock` and `categoryId` on products, reset-token expiry, `UNIQUE(userId, productId)` on reviews, all timestamps → `timestamptz` |
| `1793960000000-AddProfileImagePublicId` | `users.profileImagePublicId` (needed to delete the old Cloudinary image)                                                                                                                            |
| `1794249421338-UserIdToUuid`            | `users.id` becomes a **UUID** (every foreign key to it follows), `audit_logs.entityId` becomes text, refresh tokens are deleted                                                                     |

Upgrading an older database: the `Final` migration converts timestamps **in place** (existing
dates are kept), lowercases e-mails, and **stops with a clear message without changing anything**
if it finds e-mails that only differ by letter case or more than one review by the same user for
the same product. Clean those rows and run it again.

Upgrading to UUID user ids (`UserIdToUuid`, needs PostgreSQL 13+): every user gets a new random UUID and all
related rows (products, reviews, cart, wishlist, orders, notifications, audit logs) follow it. Tokens issued
before the upgrade carry a numeric `userId` and are rejected, so **everybody has to log in again**; the
migration deletes the old refresh tokens. `audit_logs.entityId` is now a string (`"12"` for an order, a UUID
for a user), and `?userId=` filters on `/orders` and `/audit-logs` expect a UUID. `migration:revert` gives the
users new sequential integer ids (the original ones are not stored).

---

## API reference

Every route lives under `/api`. Legend: 🔓 public · 🔑 needs `Authorization: Bearer <token>` · 👑 admin only.
Every route needs a token **unless it is marked 🔓** (the guard is global, so a new route is protected by default).
Successful answers always have the same envelope: `{ "success": true, "data": ... }` (`data` is `null` when there is nothing to return).
Errors always have the same shape: `{ "success": false, "statusCode": 400, "code": "VALIDATION_FAILED", "message": "...", "error": "BAD_REQUEST", "path": "/api/...", "timestamp": "..." }`
(`message` is an array for validation errors; unexpected `500` errors never show their details).
Validation is strict: unknown properties in a body are rejected with `400`.

**Lists** (products, reviews, wishlist, orders, coupons, users, audit logs, notifications) return
`{ "success": true, "data": [...], "meta": { "page", "limit", "total", "totalPages" } }`.
Query: `page` (≥1), `limit` (1–100, default 10), `sortBy` (a whitelist per list; `400 INVALID_SORT_FIELD` otherwise) and
`sortOrder` (`ASC` | `DESC`, default `DESC`). Sortable fields: products `createdAt|price|title` · orders `createdAt|totalPrice|status` ·
reviews `createdAt|rating` · coupons `createdAt|code|expiresAt|usedCount` · users `createdAt|email|username` · wishlist `createdAt`.

### Auth — `/api/v1/auth`

| Method & path                          | Access | Description                                                                                                                                     |
| -------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /register`                       | 🔓     | `{ email, password (6–72), username? (2–150) }` → emails a 6-digit code                                                                         |
| `POST /verify-email`                   | 🔓     | `{ email, otp }` → the account can log in                                                                                                       |
| `POST /resend-verification-otp`        | 🔓     | `{ email }` → same answer whether or not the account exists; at most one code per minute                                                        |
| `POST /login`                          | 🔓     | `{ email, password }` → `{ accessToken, expiresIn }` + the `refresh_token` httpOnly cookie. An unverified account gets `403 EMAIL_NOT_VERIFIED` |
| `POST /refresh`                        | 🔓     | Needs the cookie. Rotates it and returns `{ accessToken, expiresIn }`. `401` `REFRESH_TOKEN_MISSING` / `_INVALID` / `_EXPIRED` / `_REUSED`      |
| `POST /logout`                         | 🔓     | Revokes the session of the cookie and clears it. Always `200`                                                                                   |
| `POST /forgot-password`                | 🔓     | `{ email }` → emails a code; same answer whether or not the account exists                                                                      |
| `POST /reset-password`                 | 🔓     | `{ email, otp, newPassword }` — signs out **every** session of the user                                                                         |
| `POST /change-password`                | 🔑     | `{ currentPassword, newPassword }` — signs out the user's **other** sessions (the cookie's session stays)                                       |
| `GET /google` · `GET /google/callback` | 🔓     | Google sign-in; the callback returns `{ accessToken, expiresIn }` and sets the cookie                                                           |

A code is valid for 10 minutes and works once; 5 wrong guesses destroy it (ask for a new one).

**Sessions.** Send the access token as `Authorization: Bearer ...`; when it expires (`401 ACCESS_TOKEN_EXPIRED`) call `POST /auth/refresh`
(with `credentials: 'include'` in the browser) to get a new one. The refresh token is an httpOnly cookie scoped to `/api/v1/auth`
(`SameSite=None; Secure` in production), so JavaScript can never read it. Only its SHA-256 is stored (`refresh_tokens`); each login starts
a _family_ and every refresh revokes the used token and issues the next one of the family. Using an already-used token revokes the family.

### Users — `/api/v1/users`

| Method & path                                   | Access | Description                                                                  |
| ----------------------------------------------- | ------ | ---------------------------------------------------------------------------- |
| `GET /current-user`                             | 🔑     | My account                                                                   |
| `PUT /`                                         | 🔑     | `{ username? }`                                                              |
| `POST /profile-image` · `DELETE /profile-image` | 🔑     | Multipart field `profile-image`, images only, max 2 MB, stored on Cloudinary |
| `GET /`                                         | 👑     | Users, paginated (`userType` filter)                                         |
| `DELETE /:id`                                   | 🔑     | The account owner or an admin (`:id` is the user's UUID)                     |

Emails are trimmed and lower-cased, so `Sara@X.com` and `sara@x.com` are the same account.
`password` and `googleId` are never returned by any endpoint, and the e-mail is only
shown to its owner and to admins.

### Categories — `/api/categories`

| Method & path             | Access | Description                                                      |
| ------------------------- | ------ | ---------------------------------------------------------------- |
| `GET /`, `GET /:id`       | 🔓     | List / read                                                      |
| `POST /`                  | 👑     | `{ name (2–100, unique), description? (≤500) }`                  |
| `PUT /:id`, `DELETE /:id` | 👑     | Update / delete (products keep existing, category becomes empty) |

### Products — `/api/products`

| Method & path             | Access | Description                                                                                                                                             |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /`                   | 🔓     | Paginated (`title`, `minPrice`, `maxPrice`, `categoryId`, `sortBy`, `sortOrder`)                                                                        |
| `GET /:id`                | 🔓     | One product with its category, `images` (`[{ url, publicId }]`, main image first), `ratingAverage` and `reviewsCount`                                   |
| `POST /`                  | 👑     | `{ title (2–50), description (≤2000), price (≥0), stock? (≥0), categoryId? }`                                                                           |
| `PUT /:id`, `DELETE /:id` | 👑     | Update / delete (the product's images are removed from Cloudinary too)                                                                                  |
| `POST /:id/images`        | 👑     | Multipart field `images` (up to 5 files per request, 5 MB each; png, jpeg, webp, gif). A product can have **8** images in total. Returns all its images |
| `DELETE /:id/images`      | 👑     | Body `{ publicId }` (from the product's `images`). Removes the image and its Cloudinary file                                                            |
| `GET /:id/reviews`        | 🔓     | The reviews of the product, newest first (paginated)                                                                                                    |

Products in a list carry `ratingAverage` (0 when there are no reviews) and `reviewsCount`; both are calculated from the reviews
(one grouped query per page), so they can never go out of date. The reviews themselves are not part of the product: use
`GET /api/products/:id/reviews`.

`GET /` query: `title` (contains, case-insensitive; `%` and `_` are treated literally), `minPrice`, `maxPrice`,
`categoryId`, `sortBy` (`createdAt` \| `price` \| `title`), `order` (`ASC` \| `DESC`), `page` (≥1), `limit` (1–100, default 10).
`minPrice > maxPrice` is a `400`.

### Reviews — `/api/reviews`

| Method & path      | Access | Description                                                                       |
| ------------------ | ------ | --------------------------------------------------------------------------------- |
| `POST /:productId` | 🔑     | `{ rating (1–5), comment (2–1000) }`. A second review of the same product → `409` |
| `GET /:id`         | 🔑     | One review                                                                        |
| `PUT /:id`         | 🔑     | Author only                                                                       |
| `DELETE /:id`      | 🔑     | Author or admin                                                                   |
| `GET /?page&limit` | 👑     | All reviews, newest first                                                         |

### Cart — `/api/cart` (🔑 all)

| Method & path        | Description                                                                            |
| -------------------- | -------------------------------------------------------------------------------------- |
| `GET /`              | `{ items: [{ id, productId, title, price, stock, quantity, subtotal }], total }`       |
| `POST /`             | `{ productId, quantity (1–99) }`; adds to the quantity if the product is already there |
| `PUT /:productId`    | `{ quantity }` — set the exact quantity                                                |
| `DELETE /:productId` | Remove one product                                                                     |
| `DELETE /`           | Empty the cart                                                                         |

The cart does **not** reserve stock; stock is checked and taken at checkout.

### Orders — `/api/orders` (🔑 all)

| Method & path       | Access      | Description                                                                                                                  |
| ------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `POST /`            | 🔑          | `{ shippingAddress (5–500), couponCode? }` — checkout from the cart. `400` empty cart or bad coupon · `409` not enough stock |
| `GET /me`           | 🔑          | My orders (`status`, `page`, `limit`, `sortBy`, `sortOrder`)                                                                 |
| `GET /:id`          | owner/admin | One order with its items                                                                                                     |
| `POST /:id/cancel`  | owner/admin | Cancel and give the stock back                                                                                               |
| `GET /`             | 👑          | All orders (`status`, `userId`, `page`, `limit`)                                                                             |
| `PATCH /:id/status` | 👑          | `{ status }` — only valid transitions are accepted (`409` otherwise)                                                         |

### Coupons — `/api/coupons`

| Method & path       | Access | Description                                                                                           |
| ------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| `POST /validate`    | 🔑     | `{ code }` → `{ code, subtotal, discount, total }` for **my cart**. Nothing is used yet               |
| `POST /`            | 👑     | Create a coupon (body below)                                                                          |
| `GET /`, `GET /:id` | 👑     | List (paginated) / read, with `usedCount`                                                             |
| `PATCH /:id`        | 👑     | Change anything **except the code**; send `null` to remove `maxDiscountAmount` / `usageLimit` / dates |
| `DELETE /:id`       | 👑     | Delete. Orders that used it keep its code and discount                                                |

Body of `POST /`: `code` (3–50 letters, digits, `-`, `_`; stored in UPPER CASE, unique), `type` (`percentage` \| `fixed`),
`value` (percentage 0.01–100, or an amount), and optional `minOrderAmount`, `maxDiscountAmount`, `startsAt`, `expiresAt`,
`usageLimit` (total number of orders), `isActive`.

The discount is rounded to the cent and can never be more than the cart (the total is never negative).

### Wishlist — `/api/wishlist` (🔑 all)

| Method & path        | Description                                                              |
| -------------------- | ------------------------------------------------------------------------ |
| `GET /`              | My saved products, newest first (paginated)                              |
| `POST /:productId`   | Save a product. Saving it again is not an error. Unknown product → `404` |
| `DELETE /:productId` | Remove it. Not in the wishlist → `404`                                   |

### Notifications — `/api/v1/notifications` (🔑 all)

| Method & path     | Description                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `GET /`           | My notifications, newest first (`unread=true` filter). `meta.unreadCount` is the total unread |
| `PATCH /:id/read` | Mark one as read (`404` if it is not mine)                                                    |
| `PATCH /read-all` | Mark all as read                                                                              |

Types: `ORDER_CREATED`, `ORDER_PAID`, `ORDER_SHIPPED`, `ORDER_DELIVERED`, `ORDER_CANCELLED` (to the customer, also e-mailed) and
`NEW_ORDER`, `LOW_STOCK` (to every admin, in-app only; `LOW_STOCK` is sent once, when a product's stock falls to 5 or less).
Notifications are saved in the transaction of the action; the e-mail is sent only after it commits.

### Audit logs — `/api/v1/audit-logs` (👑)

| Method & path | Description                                                                |
| ------------- | -------------------------------------------------------------------------- |
| `GET /`       | Newest first; filters `action`, `entity` (`Product`, `Order`...), `userId` |

Recorded: `PRODUCT_*`, `CATEGORY_*`, `COUPON_*` (created / updated / deleted), `ORDER_CREATED`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELLED`,
`REVIEW_DELETED` (a moderator removing someone else's review) and `USER_DELETED`. Updates store `metadata.changes` with `before` / `after` of
each changed field (an update that changes nothing writes nothing). `userId` becomes `null` if that user is deleted later; the history stays.

### Analytics — `/api/v1/analytics` (👑)

| Method & path    | Description                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET /dashboard` | Users, products (out of stock / low stock), orders by status, revenue, average order value, discounts, top 5 products, reviews |

A _sale_ is an order that is `paid`, `shipped` or `delivered`; `pending` and `cancelled` orders are not revenue. The result is cached in Redis
for 60 seconds and cleared when orders, products, reviews or users change.

### Uploads — `/api/uploads`

| Method & path    | Access | Description                         |
| ---------------- | ------ | ----------------------------------- |
| `POST /`         | 🔑     | Multipart field `image`             |
| `POST /multiple` | 🔑     | Multipart field `images` (up to 10) |
| `GET /:image`    | 🔓     | Serves a stored image               |
| `DELETE /:image` | 👑     | Deletes a stored image              |

Allowed types: png, jpeg, gif, webp — max 5 MB. The stored name is random and its extension is
derived from the MIME type, never from the uploaded file name.

> These files live on the **server disk**: fine for one server, but lost on ephemeral / serverless hosts. Product images and
> profile images use Cloudinary instead.

### Health

`GET /api/health` → `200 { "status": "ok", "database": "up" }` or `503` when the database is unreachable.

---

## How orders and checkout work

Order status flow:

```
pending ──► paid ──► shipped ──► delivered
   │          │
   └──────────┴──► cancelled        (only from pending or paid)
```

**Checkout** is one database transaction:

1. The user's cart rows are taken with `DELETE ... RETURNING`, so a double click or two parallel
   requests can only consume the cart once → **one order**.
2. Stock is reduced with `UPDATE ... SET stock = stock - n WHERE stock >= n`, so two buyers can
   never take the last item → **no overselling**. Products are always processed in the same order
   to avoid deadlocks.
3. If a `couponCode` is sent, the coupon is used **after** the stock, with a single
   `UPDATE ... WHERE usedCount < usageLimit AND isActive AND <dates ok> RETURNING`, so the usage limit can never be passed,
   not even by many buyers at the same moment. Products are always locked before coupons (checkout and cancel), so there are no deadlocks.
4. The order is saved together with a **snapshot** of each product's title and unit price, its `subtotal`, `discountAmount`,
   `totalPrice` (= subtotal − discount) and the `couponCode`.

If any step fails, everything rolls back, including the cart and the stock.

Other rules:

- **Cancel** is a compare-and-set on the status, so cancelling twice (or from two places at once)
  returns the stock **and the coupon use** only once.
- Money is calculated in **cents** (integers), so there are no floating-point errors.
- The price used is the one at checkout time, not when the item was added to the cart.
- Deleting a user keeps their orders (`userId` becomes `NULL`); deleting a product keeps its order
  lines (they keep the saved title and price); deleting a coupon keeps its orders (the code and discount stay).

---

## Data model

```mermaid
erDiagram
    USERS ||--o{ PRODUCTS : creates
    USERS ||--o{ REVIEWS : writes
    USERS ||--o{ CART_ITEMS : has
    USERS ||--o{ ORDERS : places
    USERS ||--o{ REFRESH_TOKENS : "has sessions"
    USERS ||--o{ AUDIT_LOGS : performs
    USERS ||--o{ NOTIFICATIONS : receives
    CATEGORIES ||--o{ PRODUCTS : groups
    PRODUCTS ||--o{ REVIEWS : receives
    USERS ||--o{ WISHLIST_ITEMS : saves
    PRODUCTS ||--o{ WISHLIST_ITEMS : "saved in"
    COUPONS ||--o{ ORDERS : "applied to"
    PRODUCTS ||--o{ CART_ITEMS : "in"
    ORDERS ||--|{ ORDER_ITEMS : contains
    PRODUCTS ||--o{ ORDER_ITEMS : "sold as"

    USERS {
        uuid id PK
        string email UK
        string password "nullable (Google accounts)"
        enum userType "admin or user"
        bool isAccountVerified
    }
    PRODUCTS {
        int id PK
        string title
        float price
        int stock "CHECK stock >= 0"
    }
    REVIEWS {
        int id PK
        int rating "1 to 5"
        string comment
    }
    CART_ITEMS {
        int id PK
        int quantity "1 to 99"
    }
    ORDERS {
        int id PK
        enum status
        numeric subtotal
        numeric discountAmount
        numeric totalPrice "subtotal - discountAmount"
        string couponCode "snapshot"
        string shippingAddress
    }
    COUPONS {
        int id PK
        string code UK "UPPER CASE"
        enum type "percentage or fixed"
        numeric value
        int usageLimit "nullable"
        int usedCount
    }
    WISHLIST_ITEMS {
        int id PK
        uuid userId UK
        int productId UK
    }
    ORDER_ITEMS {
        int id PK
        string productTitle "snapshot"
        numeric unitPrice "snapshot"
        int quantity
    }
```

Delete behaviour: removing a category sets `products.categoryId` to `NULL`; removing a product removes its
reviews, images, wishlist entries and cart lines and sets `order_items.productId` to `NULL`; removing a user removes their
reviews, cart and wishlist and sets `orders.userId` to `NULL`; removing a coupon sets `orders.couponId` to `NULL`.

---

## Security

- Sessions: refresh tokens are httpOnly cookies, stored only as SHA-256, rotated on every use, with family revocation on reuse; a password reset or change revokes sessions. Expired rows are cleaned hourly (Redis lock).
- Passwords are hashed with bcrypt; login takes the same time whether or not the e-mail exists.
- `password` and `googleId` never appear in any response; e-mails are hidden from
  public product and review data.
- Verification and reset use 6-digit one-time codes: only an HMAC of the code is stored (Redis), it expires after 10 minutes, works once,
  and is destroyed after 5 wrong guesses (checked atomically in a Lua script); a new code can be requested once a minute.
- Forgot-password gives the same answer for unknown e-mails (no account enumeration).
- A Google sign-in cannot take over an account that someone pre-registered with the same e-mail by password.
- **Secure by default:** `JwtAuthGuard` is global, so a route is protected unless it carries `@Public()`. An e2e test lists every
  route of the app and fails if a route that is not in the expected public list answers without a token.
- The user is read from the database on every protected request: a demoted or deleted user loses access immediately.
- CORS is closed in production unless `CORS_ORIGINS` lists the front-end origins.
- Unexpected errors answer `500 Internal server error`; the details only go to the log.
- Image uploads (Cloudinary): type whitelist (no SVG), size limit, kept in memory (nothing is written to the server disk).
- Uploads: login required, extension chosen from the MIME type, random names, path traversal (`../`) blocked.
- Rate limiting: 100 requests/minute/IP globally; every `/auth` route 5/minute/IP.
- Helmet headers, strict DTO validation (`whitelist` + `forbidNonWhitelisted`), parameterised SQL everywhere.

---

## Testing

```bash
npm test                  # unit tests (no database needed)

# end-to-end: needs a PostgreSQL database that is safe to wipe
DATABASE_URL=postgres://user:password@localhost:5432/nest_e2e npm run test:e2e
TZ=Africa/Cairo npm run test:e2e        # same suite under another time zone
npm run test:cov                        # unit-test coverage
```

The e2e suite (78 tests, plus 15 unit tests) runs against **real PostgreSQL** and a **real SMTP server** (`test/support/smtp-sink.ts` receives the
e-mails). Only Cloudinary is faked. It **drops and rebuilds the whole schema from the migrations**, so it refuses to run unless the
database is on `localhost` and its name contains `test` or `e2e`.

It covers: the full auth flow, roles and data leaks, uploads, categories and products (search, filters, sorting, pagination),
reviews and ratings, product images, wishlist, coupons, cart, orders, **concurrency** (40 buyers for 10 items, 10 buyers for a
coupon with 3 uses, parallel image uploads against the limit, double-click checkout, parallel cancels, cancel and checkout at the
same time without deadlocks), CORS, the error format, the list of public routes, time zones, and a final consistency check
(stock = initial − sold, totals = items − discount, coupon uses = live orders).

The GitHub Actions workflow in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs lint, build, unit and e2e tests on every push.

---

## npm scripts

| Script                                                      | Purpose                                              |
| ----------------------------------------------------------- | ---------------------------------------------------- |
| `start:dev` / `start:debug`                                 | Development with watch mode                          |
| `build` · `start:prod`                                      | Compile to `dist/` · run the compiled app            |
| `lint` · `lint:check`                                       | ESLint with auto-fix · ESLint without changing files |
| `format`                                                    | Prettier                                             |
| `test` · `test:watch` · `test:cov`                          | Unit tests                                           |
| `test:e2e`                                                  | End-to-end tests                                     |
| `migration:run` · `migration:revert` · `migration:generate` | TypeORM migrations (build first, automatically)      |

---

## Project structure

```
src/
  common/          shared by every module (see below)
  config/          env validation
  auth/            register / verify / login / Google / password reset (OTP) / change password, guards are registered here
  users/           the user entity, profile, profile image, admin user list
  products/        products, product images (+ unit tests)
  categories/   reviews/   cart/   orders/   uploads/
  coupons/         coupon CRUD, validation and redemption
  wishlist/        saved products
  audit-logs/      audit trail (entity, enum, service used by the other modules, admin list)
  notifications/   in-app notifications + e-mail dispatcher (sent after commit)
  analytics/       admin dashboard statistics (Redis cached)
  mail/            mail service and the OTP e-mail template
  app.module.ts    imports + the global guards (rate limit -> auth -> roles)
  app.setup.ts     HTTP setup: Helmet, CORS, trust proxy, Swagger (used by main.ts and by the e2e tests)
db/
  data-source.ts   TypeORM data source used by the CLI and the app
  migrations/      schema history
test/              e2e suite + SMTP sink
rest_client/       sample requests (VS Code REST Client)
.github/workflows/ CI
```

### The `common` folder

Code that more than one module uses lives in `src/common`. Each sub-folder has an `index.ts`, so imports look like
`import { Auth, Public } from '../common/decorators'`.

| Folder                         | Contains                                                                                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guards/`                      | `JwtAuthGuard` (global: token + user from the database, puts the `User` on the request, skips `@Public()`), `RolesGuard` (global: checks `@Roles()`), `GoogleAuthGuard` |
| `decorators/`                  | `@Public()`, `@Auth(...roles)` (Swagger + roles), `@Roles()`, `@CurrentUser()` (the `User` entity), `@ApiPaginated()`                                                   |
| `pagination/`                  | `PaginationQueryDto` (`?page&limit&sortBy&sortOrder`), `Paginated<T>` (`data` + `meta`), `toSkip()` and `resolveSort()` (whitelist)                                     |
| `interceptors/`                | `ResponseInterceptor` (every answer → `{ success, data, meta? }`), `LoggingInterceptor` (one line per request)                                                          |
| `filters/`                     | `AllExceptionsFilter` (one error format with a `code`, **all** PostgreSQL errors → 4xx by error code and constraint name, 500 without details)                          |
| `cloudinary/`                  | `CloudinaryModule` / `CloudinaryService` (upload, delete, clear errors) and `deleteImageQuietly()`                                                                      |
| `upload/`                      | `imageUploadOptions()` — Multer options for image routes (memory storage, type whitelist, size limit)                                                                   |
| `enums/` `types/` `constants/` | `UserType`, `OrderStatus`, `CouponType`, `AuthenticatedRequest`, metadata keys, header names                                                                            |
| `utils/`                       | `rowsOf()`, `toCents()` / `fromCents()`, `escapeLike()`, `durationToSeconds()`, `sha256()` / `safeEqual()`, `getChangedFields()` (audit diffs), `@ToBoolean()`          |
| `transforms/` `transformers/`  | `@NormalizeEmail()`, `@NormalizeCode()`, the numeric column transformer                                                                                                 |
| `errors/`                      | `ErrorCode` enum: the `code` field of every error response                                                                                                              |
| `redis/` `cache/`              | Global `RedisModule` / `RedisService` (ioredis, JSON helpers); `CacheInvalidationService` (clears the dashboard cache)                                                  |
| `common.module.ts`             | Global module: the global filter, interceptors and validation pipe                                                                                                      |

**Database errors:** services never look at PostgreSQL error codes. They just save or insert; a unique / foreign key / check violation
reaches `AllExceptionsFilter`, which answers by error code and, for the constraints listed in `PG_CONSTRAINTS`, with a specific `code` and message
(for example `CATEGORY_NAME_TAKEN`). To give a new constraint its own message, add its name there.

**How to add a feature:** create the module, put `@Public()` only on routes everybody may call, `@Auth()` / `@Auth(UserType.ADMIN)` on
the others (it documents them in Swagger), return `Paginated.of(items, total, query)` from list services (validate `sortBy` with `resolveSort()`), call `AuditLogsService.record(manager, ...)` inside the transaction of every admin write, and add the entity to
`db/data-source.ts` and a migration (`npm run migration:generate`).

---

## Deployment notes

- Run `npm run build`, apply migrations against the production database, then `npm run start:prod`
  with `NODE_ENV=production` (reads `.env`, or real environment variables).
- Behind a reverse proxy (Vercel, Nginx...) set `TRUST_PROXY=1` so rate limiting sees the real client IP, not the proxy's.
- Set `CORS_ORIGINS` to the URL(s) of your front-end; in production CORS is closed when it is empty.
- Disk uploads (`/images`) do not work on serverless platforms such as Vercel and are lost on ephemeral
  file systems; use Cloudinary or S3 there. Profile images and product images already use Cloudinary.
- Redis must be reachable (`REDIS_HOST`): without it nobody can verify an email or reset a password.
- The Swagger UI is enabled in every environment; protect or remove it if the API is public.

## Troubleshooting

| Symptom                                         | Cause / fix                                                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `Invalid environment variables: ...` at startup | Fill them in the env file for your `NODE_ENV`, or export them                                                        |
| `column "..." does not exist`                   | Migrations were not applied: `npm run migration:run`                                                                 |
| The OTP e-mail never arrives                    | SMTP settings are wrong (the error is in the log; registration itself still succeeds). Ask for a new code after 60 s |
| `Redis error: connect ECONNREFUSED`             | Fix `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD`                                                                   |
| Google login: `redirect_uri_mismatch`           | `GOOGLE_CALLBACK_URL` must exactly match an authorised redirect URI in Google Console                                |
| e2e refuses to start                            | The database must be on `localhost` and named like `nest_e2e` (it is wiped)                                          |

## Known limitations

- **Access tokens are not revocable:** a JWT access token stays valid until it expires (15 minutes by default) even after logout or a password change; the refresh token (the long-lived part) _is_ revoked immediately.
- **No payment integration:** orders go `pending → paid` by an admin action; there is no payment gateway.
- **No seed / admin CLI:** the first admin is promoted with SQL (see above).
- Deleting a user who created products (normally an admin) also deletes those products, because a product belongs to its creator.
- Updating your password through `PUT /api/users` does not ask for the current password.
- Product titles are stored in lower case.
- A coupon has a total usage limit, but **no limit per customer** (the same user can use it on several orders).
- Products cannot be sorted by rating (the rating is calculated per page, not stored).
- Image uploads check the declared MIME type; Cloudinary rejects files that are not real images (`400`).
- Prices have no currency field and there is no shipping cost or tax.
