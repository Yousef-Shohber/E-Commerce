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

| Area           | What you get                                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**       | Register with email verification (SMTP), JWT login, forgot / reset password (link valid for 1 hour, single use), Google OAuth 2.0  |
| **Users**      | Profile, update username / password, delete account (owner or admin), profile image on Cloudinary, roles `admin` / `user`          |
| **Categories** | CRUD (admin only), unique names                                                                                                    |
| **Products**   | CRUD (admin only), stock, category, case-insensitive search, price filters, sorting, pagination with an `X-Total-Count` header     |
| **Images**     | Up to 8 images per product on **Cloudinary** (admin), kept in order; files are deleted from Cloudinary with the image / product    |
| **Reviews**    | Rating 1–5 with a comment, **one review per user per product**; products show `ratingAverage` and `reviewsCount`; paginated list   |
| **Wishlist**   | Save / remove products, paginated list, saving twice is harmless                                                                   |
| **Coupons**    | Percentage or fixed coupons (admin), minimum cart, cap, validity dates, usage limit; the limit can never be passed concurrently    |
| **Cart**       | Add / change / remove / clear; adding is a single atomic statement                                                                 |
| **Orders**     | Checkout from the cart (with an optional coupon), cancel (stock and coupon use are returned), status flow, "my orders", admin list |
| **Uploads**    | Image upload to disk (png, jpg, gif, webp, 5 MB, login required)                                                                   |
| **Ops**        | `GET /api/health`, Swagger UI at `/swagger`, env validation, rate limiting, Helmet, CORS, one error format, access log             |

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
(`.env.development` by default). A variable that is already set in the real environment
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
# 1) register (a verification link is emailed), open the link, then log in
curl -X POST localhost:3000/api/users/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"sara@example.com","password":"secret123","username":"Sara"}'

curl -X POST localhost:3000/api/users/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"sara@example.com","password":"secret123"}'
# -> { "accessToken": "eyJ..." }

# 2) browse products (public)
curl 'localhost:3000/api/products?title=phone&minPrice=100&sortBy=price&order=ASC&limit=5' -i

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

| Variable                | Example                                                | Notes                                                                                                                   |
| ----------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | `postgres://user:password@localhost:5432/nest_shop`    | Add `?sslmode=require` for hosted databases such as Neon                                                                |
| `DOMAIN`                | `http://localhost:3000`                                | Public URL of the API; used in e-mail links and as the Swagger server                                                   |
| `JWT_SECRET`            | 96 random hex characters                               | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`                                              |
| `JWT_EXPIRES_IN`        | `1d`                                                   | Any [`ms`](https://github.com/vercel/ms) value (`15m`, `7d`, ...)                                                       |
| `SMTP_HOST`             | `sandbox.smtp.mailtrap.io`                             | STARTTLS is used (`secure: false`), so use port **587** or **2525**, not 465                                            |
| `SMTP_PORT`             | `587`                                                  |                                                                                                                         |
| `SMTP_USERNAME`         | `you@example.com`                                      | Also the default sender address                                                                                         |
| `SMTP_PASSWORD`         | `...`                                                  |                                                                                                                         |
| `GOOGLE_CLIENT_ID`      | `...apps.googleusercontent.com`                        | Google Cloud Console → Credentials → OAuth client                                                                       |
| `GOOGLE_CLIENT_SECRET`  | `...`                                                  |                                                                                                                         |
| `GOOGLE_CALLBACK_URL`   | `http://localhost:3000/api/users/auth/google/callback` | Must be listed as an authorised redirect URI in Google Console                                                          |
| `CLOUDINARY_CLOUD_NAME` | `...`                                                  | Used for profile images and product images                                                                              |
| `CLOUDINARY_API_KEY`    | `...`                                                  |                                                                                                                         |
| `CLOUDINARY_API_SECRET` | `...`                                                  |                                                                                                                         |
| `PORT`                  | `3000`                                                 | _Optional._ Default `3000`                                                                                              |
| `MAIL_FROM`             | `"Shop" <no-reply@example.com>`                        | _Optional._ Default `"Nest JS" <SMTP_USERNAME>`                                                                         |
| `THROTTLE_LIMIT`        | `100`                                                  | _Optional._ Requests per minute per IP for the whole API                                                                |
| `CORS_ORIGINS`          | `https://shop.example.com,https://admin.example.com`   | _Optional._ Front-end origins allowed by CORS. Unset: open in development, **closed in production**                     |
| `TRUST_PROXY`           | `1`                                                    | _Optional._ Number of reverse proxies in front of the app (Vercel, Nginx...), so the rate limit sees the real client IP |

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

Upgrading an older database: the `Final` migration converts timestamps **in place** (existing
dates are kept), lowercases e-mails, and **stops with a clear message without changing anything**
if it finds e-mails that only differ by letter case or more than one review by the same user for
the same product. Clean those rows and run it again.

---

## API reference

Every route lives under `/api`. Legend: 🔓 public · 🔑 needs `Authorization: Bearer <token>` · 👑 admin only.
Every route needs a token **unless it is marked 🔓** (the guard is global, so a new route is protected by default).
Errors always have the same shape: `{ "statusCode": 400, "message": "...", "error": "Bad Request", "path": "/api/...", "timestamp": "..." }`
(`message` is an array for validation errors; unexpected `500` errors never show their details).
Validation is strict: unknown properties in a body are rejected with `400`.

**Lists** (products, reviews, wishlist, orders, coupons) return a plain **array**; the paging information is in the response
headers `X-Total-Count`, `X-Page`, `X-Limit` and `X-Total-Pages` (exposed to browsers through CORS). Query: `page` (≥1), `limit` (1–100, default 10).

### Users — `/api/users`

| Method & path                                    | Access | Description                                                                                          |
| ------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------- |
| `POST /auth/register`                            | 🔓     | `{ email, password (6–72), username? (2–150) }` → sends a verification e-mail                        |
| `POST /auth/login`                               | 🔓     | `{ email, password }` → `{ accessToken }`. Unverified accounts get a new verification e-mail instead |
| `GET /verify-email/:id/:token`                   | 🔓     | Link from the e-mail                                                                                 |
| `POST /forgot-password`                          | 🔓     | `{ email }` → same answer whether or not the account exists                                          |
| `GET /reset-password/:id/:token`                 | 🔓     | Checks that the link is valid and not expired                                                        |
| `POST /reset-password`                           | 🔓     | `{ userId, resetPasswordToken, newPassword }`                                                        |
| `GET /auth/google` · `GET /auth/google/callback` | 🔓     | Google sign-in; the callback returns `{ accessToken }`                                               |
| `GET /current-user`                              | 🔑     | My account                                                                                           |
| `PUT /`                                          | 🔑     | `{ username?, password? }`                                                                           |
| `POST /profile-image` · `DELETE /profile-image`  | 🔑     | Multipart field `profile-image`, images only, max 2 MB, stored on Cloudinary                         |
| `GET /`                                          | 👑     | All users                                                                                            |
| `DELETE /:id`                                    | 🔑     | The account owner or an admin                                                                        |

Emails are trimmed and lower-cased, so `Sara@X.com` and `sara@x.com` are the same account.
`password`, tokens and `googleId` are never returned by any endpoint, and the e-mail is only
shown to its owner and to admins.

### Categories — `/api/categories`

| Method & path             | Access | Description                                                      |
| ------------------------- | ------ | ---------------------------------------------------------------- |
| `GET /`, `GET /:id`       | 🔓     | List / read                                                      |
| `POST /`                  | 👑     | `{ name (2–100, unique), description? (≤500) }`                  |
| `PUT /:id`, `DELETE /:id` | 👑     | Update / delete (products keep existing, category becomes empty) |

### Products — `/api/products`

| Method & path                 | Access | Description                                                                                                                                             |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /`                       | 🔓     | Returns an **array**; the total number of matches is in the `X-Total-Count` response header                                                             |
| `GET /:id`                    | 🔓     | One product with its category, images (in order), `ratingAverage` and `reviewsCount`                                                                    |
| `POST /`                      | 👑     | `{ title (2–50), description (≤2000), price (≥0), stock? (≥0), categoryId? }`                                                                           |
| `PUT /:id`, `DELETE /:id`     | 👑     | Update / delete (the product's images are removed from Cloudinary too)                                                                                  |
| `POST /:id/images`            | 👑     | Multipart field `images` (up to 5 files per request, 5 MB each; png, jpeg, webp, gif). A product can have **8** images in total. Returns all its images |
| `DELETE /:id/images/:imageId` | 👑     | Removes the image and its Cloudinary file                                                                                                               |
| `GET /:id/reviews`            | 🔓     | The reviews of the product, newest first (paginated)                                                                                                    |

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
| `GET /me`           | 🔑          | My orders (`status`, `page`, `limit`); total in `X-Total-Count`                                                              |
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
    CATEGORIES ||--o{ PRODUCTS : groups
    PRODUCTS ||--o{ REVIEWS : receives
    PRODUCTS ||--o{ PRODUCT_IMAGES : shows
    USERS ||--o{ WISHLIST_ITEMS : saves
    PRODUCTS ||--o{ WISHLIST_ITEMS : "saved in"
    COUPONS ||--o{ ORDERS : "applied to"
    PRODUCTS ||--o{ CART_ITEMS : "in"
    ORDERS ||--|{ ORDER_ITEMS : contains
    PRODUCTS ||--o{ ORDER_ITEMS : "sold as"

    USERS {
        int id PK
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
    PRODUCT_IMAGES {
        int id PK
        string url
        string publicId "Cloudinary id, never sent to clients"
        int position "0 = main image"
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
        int userId UK
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

- Passwords are hashed with bcrypt; login takes the same time whether or not the e-mail exists.
- `password`, `verificationToken`, `resetPasswordToken` and `googleId` never appear in any response; e-mails are hidden from
  public product and review data.
- Verification and reset tokens are random, compared in constant time; a reset token expires after 1 hour and can be used once
  (atomic update).
- Forgot-password gives the same answer for unknown e-mails (no account enumeration).
- A Google sign-in cannot take over an account that someone pre-registered with the same e-mail by password.
- **Secure by default:** `JwtAuthGuard` is global, so a route is protected unless it carries `@Public()`. An e2e test lists every
  route of the app and fails if a route that is not in the expected public list answers without a token.
- The user is read from the database on every protected request: a demoted or deleted user loses access immediately.
- CORS is closed in production unless `CORS_ORIGINS` lists the front-end origins.
- Unexpected errors answer `500 Internal server error`; the details only go to the log. The access log writes the route pattern,
  never the real URL, so verification / reset tokens in links stay out of the logs.
- Image uploads (Cloudinary): type whitelist (no SVG), size limit, kept in memory (nothing is written to the server disk).
- Uploads: login required, extension chosen from the MIME type, random names, path traversal (`../`) blocked.
- Rate limiting: 100 requests/minute/IP globally; login, register, forgot-password and reset-password 5/minute/IP.
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
  users/           auth, Google strategy, DTOs, profile image
  products/        products, product images (+ unit tests)
  categories/   reviews/   cart/   orders/   uploads/
  coupons/         coupon CRUD, validation and redemption
  wishlist/        saved products
  mail/            mail service and EJS templates (verify e-mail, reset password)
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

| Folder                         | Contains                                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `guards/`                      | `JwtAuthGuard` (global: token + user from the database, skips `@Public()`), `RolesGuard` (global: checks `@Roles()`)    |
| `decorators/`                  | `@Public()`, `@Auth(...roles)` (Swagger + roles), `@Roles()`, `@CurrentUser()`, `@ApiPaginated()`                       |
| `pagination/`                  | `PaginationQueryDto` (`?page&limit`), `Paginated<T>` and `resolvePagination()`                                          |
| `interceptors/`                | `PaginationInterceptor` (`Paginated` → array + `X-Total-Count`... headers), `LoggingInterceptor` (one line per request) |
| `filters/`                     | `AllExceptionsFilter` (one error format, database errors → 4xx, 500 without details)                                    |
| `cloudinary/`                  | `CloudinaryModule` / `CloudinaryService` (upload, delete, clear errors) and `deleteImageQuietly()`                      |
| `upload/`                      | `imageUploadOptions()` — Multer options for image routes (memory storage, type whitelist, size limit)                   |
| `enums/` `types/` `constants/` | `UserType`, `OrderStatus`, `CouponType`, `JwtPayloadType`, metadata keys, header names                                  |
| `utils/`                       | `PG_ERROR` codes, `pgErrorCode()`, `rowsOf()`, `toCents()` / `fromCents()`, `escapeLike()`, `safeEqual()`               |
| `transforms/` `transformers/`  | `@NormalizeEmail()`, `@NormalizeCode()`, the numeric column transformer                                                 |
| `entities/`                    | `TimestampedEntity` (id + createdAt + updatedAt) for new tables                                                         |
| `common.module.ts`             | Global module: JWT configuration, the global filter, interceptors and validation pipe                                   |

**How to add a feature:** create the module, put `@Public()` only on routes everybody may call, `@Auth()` / `@Auth(UserType.ADMIN)` on
the others (it documents them in Swagger), return `Paginated.of(items, total, query)` from list services, and add the entity to
`db/data-source.ts` and a migration (`npm run migration:generate`).

---

## Deployment notes

- Run `npm run build`, apply migrations against the production database, then `npm run start:prod`
  with `NODE_ENV=production` (reads `.env`, or real environment variables).
- Behind a reverse proxy (Vercel, Nginx...) set `TRUST_PROXY=1` so rate limiting sees the real client IP, not the proxy's.
- Set `CORS_ORIGINS` to the URL(s) of your front-end; in production CORS is closed when it is empty.
- Disk uploads (`/images`) do not work on serverless platforms such as Vercel and are lost on ephemeral
  file systems; use Cloudinary or S3 there. Profile images and product images already use Cloudinary.
- Set `DOMAIN` to the public URL, otherwise e-mail links point at the wrong host.
- The Swagger UI is enabled in every environment; protect or remove it if the API is public.

## Troubleshooting

| Symptom                                             | Cause / fix                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `Invalid environment variables: ...` at startup     | Fill them in the env file for your `NODE_ENV`, or export them                         |
| `column "..." does not exist`                       | Migrations were not applied: `npm run migration:run`                                  |
| Registration returns `503 Could not send the email` | SMTP settings are wrong (port 465 is not supported, use 587 / 2525)                   |
| Verification link points to the wrong host          | Fix `DOMAIN`                                                                          |
| Google login: `redirect_uri_mismatch`               | `GOOGLE_CALLBACK_URL` must exactly match an authorised redirect URI in Google Console |
| e2e refuses to start                                | The database must be on `localhost` and named like `nest_e2e` (it is wiped)           |

## Known limitations

- **No token revocation:** a JWT stays valid until it expires, even after a password change or logout.
- **No payment integration:** orders go `pending → paid` by an admin action; there is no payment gateway.
- **No seed / admin CLI:** the first admin is promoted with SQL (see above).
- Deleting a user who created products (normally an admin) also deletes those products, because a product belongs to its creator.
- Updating your password through `PUT /api/users` does not ask for the current password.
- Product titles are stored in lower case.
- A coupon has a total usage limit, but **no limit per customer** (the same user can use it on several orders).
- Products cannot be sorted by rating (the rating is calculated per page, not stored).
- Image uploads check the declared MIME type; Cloudinary rejects files that are not real images (`400`).
- Prices have no currency field and there is no shipping cost or tax.
