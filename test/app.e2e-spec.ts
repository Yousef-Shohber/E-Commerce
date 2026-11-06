import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { User } from '../src/users/users.entity';
import { AuthProvider } from '../src/users/auth.provider';
import { CloudinaryService } from '../src/utils/cloudinary.service';
import { UserType } from '../src/utils/enums';
import { SmtpSink } from './support/smtp-sink';
const PASSWORD = 'secret123';
const HASH = bcrypt.hashSync(PASSWORD, 4);

// ---- the only fake: Cloudinary --------------------------------------------
const cloud = {
  uploaded: [] as string[],
  deleted: [] as string[],
  failUpload: false,
  failDelete: false,
};
const fakeCloudinary = {
  uploadImage: async () => {
    if (cloud.failUpload) throw new Error('cloudinary down');
    const publicId = `img-${cloud.uploaded.length + 1}`;
    cloud.uploaded.push(publicId);
    return { url: `https://cdn.test/${publicId}.png`, publicId };
  },
  deleteImage: async (publicId: string) => {
    if (cloud.failDelete) throw new Error('cloudinary down');
    cloud.deleted.push(publicId);
  },
};

describe('Nest JS shop API (e2e, real Postgres + real SMTP)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let api: ReturnType<typeof request>;
  let baseUrl: string;
  const sink = new SmtpSink();
  const initialStock = new Map<number, number>();
  let counter = 0;

  // ---- helpers ---------------------------------------------------------
  async function makeUser(
    opts: { role?: UserType; email?: string; verified?: boolean } = {},
  ) {
    const repo = ds.getRepository(User);
    const user = await repo.save(
      repo.create({
        email: opts.email ?? `user${++counter}-${Date.now()}@e2e.test`,
        username: `user${counter}`,
        password: HASH,
        isAccountVerified: opts.verified ?? true,
        userType: opts.role ?? UserType.USER,
      }),
    );
    const token = await jwt.signAsync(
      { id: user.id, userType: user.userType },
      { secret: process.env.JWT_SECRET, expiresIn: '1d' },
    );
    return { user, token, auth: { Authorization: `Bearer ${token}` } };
  }

  async function makeProduct(
    admin: { auth: Record<string, string> },
    data: Record<string, unknown> = {},
  ) {
    const body = {
      title: `Product ${++counter}`,
      description: 'desc',
      price: 10,
      stock: 5,
      ...data,
    };
    const res = await api.post('/api/products').set(admin.auth).send(body);
    expect(res.status).toBe(201);
    initialStock.set(res.body.id, body.stock as number);
    return res.body as {
      id: number;
      title: string;
      price: number;
      stock: number;
    };
  }

  const addToCart = (
    u: { auth: Record<string, string> },
    productId: number,
    quantity = 1,
  ) => api.post('/api/cart').set(u.auth).send({ productId, quantity });

  const checkout = (u: { auth: Record<string, string> }) =>
    api
      .post('/api/orders')
      .set(u.auth)
      .send({ shippingAddress: '12 Nile St, Mansoura' });

  const q = <T = any>(sql: string, params: unknown[] = []) =>
    ds.query(sql, params) as Promise<T[]>;

  async function assertConsistency() {
    // 1) stock never negative
    expect(await q(`SELECT id FROM products WHERE stock < 0`)).toEqual([]);

    // 2) initial stock = stock left + units in orders that are not cancelled
    const rows = await q(
      `SELECT p.id, p.stock,
              COALESCE(SUM(oi.quantity) FILTER (WHERE o.status <> 'cancelled'), 0)::int AS sold
         FROM products p
         LEFT JOIN order_items oi ON oi."productId" = p.id
         LEFT JOIN orders o ON o.id = oi."orderId"
        GROUP BY p.id`,
    );
    for (const row of rows) {
      if (initialStock.has(row.id)) {
        expect(row.stock + row.sold).toBe(initialStock.get(row.id));
      }
    }

    // 3) every order total equals the sum of its items
    const bad = await q(
      `SELECT o.id FROM orders o JOIN order_items i ON i."orderId" = o.id
        GROUP BY o.id HAVING o."totalPrice" <> SUM(i."unitPrice" * i.quantity)`,
    );
    expect(bad).toEqual([]);
  }

  // ---- setup / teardown ------------------------------------------------
  beforeAll(async () => {
    const url = process.env.DATABASE_URL!;
    const parsed = new URL(url);
    // safety: never wipe a real database by mistake
    if (
      !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
      !/test|e2e/i.test(parsed.pathname)
    ) {
      throw new Error(
        `Refusing to run: DATABASE_URL must point to a LOCAL database whose name contains "test" or "e2e" (got ${parsed.hostname}${parsed.pathname})`,
      );
    }

    // fresh schema built from the real migrations
    const migrator = new DataSource({
      type: 'postgres',
      url,
      migrations: [join(__dirname, '../db/migrations/*.ts')],
    });
    await migrator.initialize();
    await migrator.query('DROP SCHEMA public CASCADE');
    await migrator.query('CREATE SCHEMA public');
    await migrator.runMigrations();
    await migrator.destroy();

    await sink.start(Number(process.env.SMTP_PORT));

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CloudinaryService)
      .useValue(fakeCloudinary)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    api = request(baseUrl.replace('[::1]', '127.0.0.1'));
    ds = app.get(DataSource);
    jwt = app.get(JwtService, { strict: false });
  });

  afterAll(async () => {
    await app?.close();
    await sink.stop();
  });

  // =====================================================================
  describe('basics', () => {
    it('GET / and /api/health (checks the database)', async () => {
      expect((await api.get('/')).text).toBe('Your App Is Working');
      const res = await api.get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok', database: 'up' });
    });
  });

  // =====================================================================
  describe('auth', () => {
    const email = 'Mixed.Case@E2E.test';

    it('rejects an invalid email and a too long password', async () => {
      let res = await api
        .post('/api/users/auth/register')
        .send({ email: 'not-an-email', password: PASSWORD });
      expect(res.status).toBe(400);
      res = await api
        .post('/api/users/auth/register')
        .send({ email: 'a@e2e.test', password: 'x'.repeat(100) });
      expect(res.status).toBe(400);
      expect(
        await q(`SELECT id FROM users WHERE email = 'a@e2e.test'`),
      ).toEqual([]);
    });

    it('register -> real email (valid sender, no stray ```) -> verify -> login', async () => {
      const res = await api
        .post('/api/users/auth/register')
        .send({ email, password: PASSWORD, username: 'mixed' });
      expect(res.status).toBe(201);

      const mails = sink.to('mixed.case@e2e.test');
      expect(mails).toHaveLength(1);
      expect(mails[0].from).toContain('sender@e2e.test'); // not "MAIL FROM:<>"
      expect(mails[0].raw).toMatch(/^From: .*<sender@e2e\.test>/im);
      expect(mails[0].text).not.toContain('```');

      // stored lowercase
      const [row] = await q(
        `SELECT email FROM users WHERE id = (SELECT max(id) FROM users)`,
      );
      expect(row.email).toBe('mixed.case@e2e.test');

      // not verified yet: login only re-sends the email
      let login = await api
        .post('/api/users/auth/login')
        .send({ email: email.toLowerCase(), password: PASSWORD });
      expect(login.status).toBe(200);
      expect(login.body.accessToken).toBeUndefined();
      expect(sink.to('mixed.case@e2e.test')).toHaveLength(2);

      const link = sink.lastLink('mixed.case@e2e.test')!;
      expect(link).toMatch(/\/api\/users\/verify-email\/\d+\/[0-9a-f]{64}$/);
      const path = link.replace('http://localhost:3000', '');

      expect(
        (await api.get(path.replace(/.$/, (c) => (c === '0' ? '1' : '0'))))
          .status,
      ).toBe(400); // wrong token
      expect((await api.get(path)).status).toBe(200);
      expect((await api.get(path)).status).toBe(400); // token is single use

      login = await api
        .post('/api/users/auth/login')
        .send({ email, password: PASSWORD }); // any letter case works
      expect(login.status).toBe(200);
      expect(typeof login.body.accessToken).toBe('string');
    });

    it('same email with a different letter case is a duplicate', async () => {
      const res = await api
        .post('/api/users/auth/register')
        .send({ email: 'MIXED.CASE@e2e.test', password: PASSWORD });
      expect(res.status).toBe(400);
    });

    it('10 parallel registrations of one email -> exactly one account', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          api
            .post('/api/users/auth/register')
            .send({ email: 'race@e2e.test', password: PASSWORD }),
        ),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status >= 500)).toHaveLength(0);
      expect(
        await q(`SELECT id FROM users WHERE email = 'race@e2e.test'`),
      ).toHaveLength(1);
    });

    it('wrong password / unknown email / Google-only account -> 400 (never 500)', async () => {
      for (const body of [
        { email, password: 'wrong-pass' },
        { email: 'nobody@e2e.test', password: PASSWORD },
      ]) {
        const res = await api.post('/api/users/auth/login').send(body);
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Invalid Email or Password');
      }
      await ds.getRepository(User).save({
        email: 'g-only@e2e.test',
        googleId: 'google-only-1',
        isAccountVerified: true,
      });
      const res = await api
        .post('/api/users/auth/login')
        .send({ email: 'g-only@e2e.test', password: PASSWORD });
      expect(res.status).toBe(400);
    });

    it('mail failure: the new account is removed so the user can try again', async () => {
      await sink.stop(); // SMTP server is down
      const res = await api
        .post('/api/users/auth/register')
        .send({ email: 'mailfail@e2e.test', password: PASSWORD });
      await sink.start(Number(process.env.SMTP_PORT));

      expect(res.status).toBe(503);
      expect(
        await q(`SELECT id FROM users WHERE email = 'mailfail@e2e.test'`),
      ).toEqual([]);
      const retry = await api
        .post('/api/users/auth/register')
        .send({ email: 'mailfail@e2e.test', password: PASSWORD });
      expect(retry.status).toBe(201);
    });

    describe('password reset', () => {
      let id: number;
      beforeAll(async () => {
        id = (await makeUser({ email: 'reset@e2e.test' })).user.id;
      });

      const requestToken = async () => {
        sink.clear();
        const res = await api
          .post('/api/users/forgot-password')
          .send({ email: 'RESET@e2e.test' });
        expect(res.status).toBe(200);
        return sink.lastLink('reset@e2e.test')!.split('/').pop()!;
      };

      it('same answer for unknown emails (no account enumeration)', async () => {
        const known = await api
          .post('/api/users/forgot-password')
          .send({ email: 'reset@e2e.test' });
        const unknown = await api
          .post('/api/users/forgot-password')
          .send({ email: 'ghost@e2e.test' });
        expect(unknown.status).toBe(known.status);
        expect(unknown.body).toEqual(known.body);
      });

      it('newPassword is required (was a 500)', async () => {
        const token = await requestToken();
        const res = await api
          .post('/api/users/reset-password')
          .send({ userId: id, resetPasswordToken: token });
        expect(res.status).toBe(400);
      });

      it('an expired token is refused', async () => {
        const token = await requestToken();
        await q(
          `UPDATE users SET "resetPasswordExpiresAt" = now() - interval '1 minute' WHERE id = $1`,
          [id],
        );
        expect(
          (await api.get(`/api/users/reset-password/${id}/${token}`)).status,
        ).toBe(400);
        const res = await api.post('/api/users/reset-password').send({
          userId: id,
          resetPasswordToken: token,
          newPassword: 'newpass123',
        });
        expect(res.status).toBe(400);
      });

      it('works once; 10 parallel uses of the same token -> exactly one succeeds', async () => {
        const token = await requestToken();
        expect(
          (await api.get(`/api/users/reset-password/${id}/${token}`)).status,
        ).toBe(200);

        const results = await Promise.all(
          Array.from({ length: 10 }, (_v, i) =>
            api.post('/api/users/reset-password').send({
              userId: id,
              resetPasswordToken: token,
              newPassword: `newpass-${i}`,
            }),
          ),
        );
        expect(results.filter((r) => r.status === 200)).toHaveLength(1);
        expect(results.filter((r) => r.status >= 500)).toHaveLength(0);

        const again = await api.post('/api/users/reset-password').send({
          userId: id,
          resetPasswordToken: token,
          newPassword: 'another1',
        });
        expect(again.status).toBe(400);
      });
    });

    it('Google sign-in: needs an email, and cannot be used to take over a pre-registered account', async () => {
      const provider = app.get(AuthProvider);
      await expect(
        provider.validateGoogleUser({
          googleId: 'x',
          email: undefined,
          username: 'x',
        }),
      ).rejects.toThrow('no email');

      // an attacker registers the victim's email (unverified) with a password he knows
      await api
        .post('/api/users/auth/register')
        .send({ email: 'victim@e2e.test', password: 'attacker-pass' });
      // the real owner signs in with Google
      const user = await provider.validateGoogleUser({
        googleId: 'victim-google-id',
        email: 'Victim@e2e.test',
        username: 'Victim',
      });
      expect(user.isAccountVerified).toBe(true);
      expect(user.password).toBeNull();
      const attack = await api
        .post('/api/users/auth/login')
        .send({ email: 'victim@e2e.test', password: 'attacker-pass' });
      expect(attack.status).toBe(400);

      // same Google account later -> same user, no duplicate
      const again = await provider.validateGoogleUser({
        googleId: 'victim-google-id',
        email: 'victim@e2e.test',
        username: 'Victim',
      });
      expect(again.id).toBe(user.id);
    });

    it('login is rate limited (5 / minute) when throttling is on', async () => {
      process.env.THROTTLE_DISABLED = 'false';
      try {
        const results = [];
        for (let i = 0; i < 7; i++) {
          results.push(
            (
              await api
                .post('/api/users/auth/login')
                .send({ email: 'brute@e2e.test', password: 'wrong-pass' })
            ).status,
          );
        }
        expect(results.slice(0, 5).every((s) => s === 400)).toBe(true);
        expect(results.slice(5)).toEqual([429, 429]);
      } finally {
        process.env.THROTTLE_DISABLED = 'true';
      }
    });
  });

  // =====================================================================
  describe('users, roles and data leaks', () => {
    it('current-user shows the email but never tokens / password / googleId', async () => {
      const u = await makeUser();
      await q(
        `UPDATE users SET "resetPasswordToken" = 'secret-reset', "verificationToken" = 'secret-verify', "googleId" = 'gid-x' WHERE id = $1`,
        [u.user.id],
      );
      const res = await api.get('/api/users/current-user').set(u.auth);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe(u.user.email);
      const text = JSON.stringify(res.body);
      for (const secret of [
        'secret-reset',
        'secret-verify',
        'gid-x',
        'password',
        'resetPasswordToken',
        'profileImagePublicId',
      ]) {
        expect(text).not.toContain(secret);
      }
    });

    it('the admin list has emails but no secrets', async () => {
      const admin = await makeUser({ role: UserType.ADMIN });
      const res = await api.get('/api/users').set(admin.auth);
      expect(res.status).toBe(200);
      expect(res.body[0].email).toBeDefined();
      expect(JSON.stringify(res.body)).not.toMatch(
        /resetPasswordToken|verificationToken|"password"|googleId/,
      );
      expect(
        (await api.get('/api/users').set((await makeUser()).auth)).status,
      ).toBe(403);
    });

    it('public product and review data never exposes emails or tokens', async () => {
      const admin = await makeUser({ role: UserType.ADMIN });
      const reviewer = await makeUser();
      await q(
        `UPDATE users SET "resetPasswordToken" = 'leak-me' WHERE id = $1`,
        [reviewer.user.id],
      );
      const product = await makeProduct(admin);
      expect(
        (
          await api
            .post(`/api/reviews/${product.id}`)
            .set(reviewer.auth)
            .send({ rating: 4, comment: 'nice' })
        ).status,
      ).toBe(201);

      const res = await api.get('/api/products');
      const text = JSON.stringify(res.body);
      expect(text).toContain('nice'); // the review is there
      expect(text).not.toContain('leak-me');
      expect(text).not.toContain(reviewer.user.email);
      expect(text).not.toContain(admin.user.email);
      expect((await api.get(`/api/products/${product.id}`)).text).not.toContain(
        reviewer.user.email,
      );
    });

    it('a demoted admin loses access immediately (old token)', async () => {
      const admin = await makeUser({ role: UserType.ADMIN });
      expect((await api.get('/api/users').set(admin.auth)).status).toBe(200);
      await q(`UPDATE users SET "userType" = 'user' WHERE id = $1`, [
        admin.user.id,
      ]);
      expect((await api.get('/api/users').set(admin.auth)).status).toBe(403);

      const admin2 = await makeUser({ role: UserType.ADMIN });
      const other = await makeUser();
      const product = await makeProduct(admin2);
      const review = await api
        .post(`/api/reviews/${product.id}`)
        .set(other.auth)
        .send({ rating: 3, comment: 'ok ok' });
      await q(`UPDATE users SET "userType" = 'user' WHERE id = $1`, [
        admin2.user.id,
      ]);
      expect(
        (await api.delete(`/api/reviews/${review.body.id}`).set(admin2.auth))
          .status,
      ).toBe(403);
    });

    it('a token of a deleted user is rejected (401)', async () => {
      const u = await makeUser();
      expect(
        (await api.delete(`/api/users/${u.user.id}`).set(u.auth)).status,
      ).toBe(200);
      expect(
        (await api.get('/api/users/current-user').set(u.auth)).status,
      ).toBe(404);
      expect(
        (await api.put('/api/users').set(u.auth).send({ username: 'zz' }))
          .status,
      ).toBe(401);
    });

    it('a normal user cannot delete others (403, also for ids that do not exist)', async () => {
      const a = await makeUser();
      const b = await makeUser();
      expect(
        (await api.delete(`/api/users/${b.user.id}`).set(a.auth)).status,
      ).toBe(403);
      expect((await api.delete('/api/users/999999').set(a.auth)).status).toBe(
        403,
      );
      const admin = await makeUser({ role: UserType.ADMIN });
      expect(
        (await api.delete(`/api/users/${b.user.id}`).set(admin.auth)).status,
      ).toBe(200);
      expect(
        (await api.delete('/api/users/999999').set(admin.auth)).status,
      ).toBe(404);
    });

    it('cannot raise your own role through register or update', async () => {
      const res = await api
        .post('/api/users/auth/register')
        .send({ email: 'esc@e2e.test', password: PASSWORD, userType: 'admin' });
      expect(res.status).toBe(400);
      const u = await makeUser();
      expect(
        (await api.put('/api/users').set(u.auth).send({ userType: 'admin' }))
          .status,
      ).toBe(400);
    });

    it('SQL injection strings are treated as plain text', async () => {
      const res = await api
        .post('/api/users/auth/login')
        .send({ email: "' OR 1=1 --@e2e.test", password: PASSWORD });
      expect(res.status).toBe(400);
      expect(
        (
          await api
            .get('/api/products')
            .query({ title: "'; DROP TABLE users; --" })
        ).status,
      ).toBe(200);
      expect(await q(`SELECT count(*)::int AS n FROM users`)).not.toEqual([
        { n: 0 },
      ]);
    });

    describe('profile image (Cloudinary is faked)', () => {
      const png = Buffer.from('89504e470d0a1a0a', 'hex');
      const upload = (u: { auth: Record<string, string> }) =>
        api
          .post('/api/users/profile-image')
          .set(u.auth)
          .attach('profile-image', png, {
            filename: 'a.png',
            contentType: 'image/png',
          });

      it('replaces the image; a failed upload keeps the old one; non-images are refused', async () => {
        const u = await makeUser();
        cloud.uploaded = [];
        cloud.deleted = [];
        const first = await upload(u);
        expect(first.status).toBe(201);
        expect(first.body.profileImage).toMatch(/^https:\/\/cdn\.test\//);
        expect(first.body.profileImagePublicId).toBeUndefined();
        const second = await upload(u);
        expect(second.status).toBe(201);
        expect(cloud.deleted).toEqual([cloud.uploaded[0]]);

        cloud.failUpload = true;
        const failed = await upload(u);
        cloud.failUpload = false;
        expect(failed.status).toBeGreaterThanOrEqual(500);
        const [row] = await q(
          `SELECT "profileImagePublicId" AS id FROM users WHERE id = $1`,
          [u.user.id],
        );
        expect(row.id).toBe(cloud.uploaded[1]); // still the 2nd image, not deleted
        expect(cloud.deleted).toEqual([cloud.uploaded[0]]);

        const text = await api
          .post('/api/users/profile-image')
          .set(u.auth)
          .attach('profile-image', Buffer.from('hi'), {
            filename: 'a.txt',
            contentType: 'text/plain',
          });
        expect(text.status).toBe(400);
      });

      it('deleting a user works even if Cloudinary is down', async () => {
        const u = await makeUser();
        await upload(u);
        cloud.failDelete = true;
        const res = await api.delete(`/api/users/${u.user.id}`).set(u.auth);
        cloud.failDelete = false;
        expect(res.status).toBe(200);
        expect(
          await q(`SELECT id FROM users WHERE id = $1`, [u.user.id]),
        ).toEqual([]);
      });
    });
  });

  // =====================================================================
  describe('uploads (disk)', () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex');

    it('needs a login', async () => {
      const res = await api
        .post('/api/uploads')
        .attach('image', png, { filename: 'a.png', contentType: 'image/png' });
      expect(res.status).toBe(401);
      expect((await api.delete('/api/uploads/x.png')).status).toBe(401);
    });

    it('stores a random .png name, serves it, refuses html and fake extensions', async () => {
      const u = await makeUser();
      const res = await api
        .post('/api/uploads')
        .set(u.auth)
        .attach('image', png, { filename: 'x.html', contentType: 'image/png' });
      expect(res.status).toBe(201);
      expect(res.body.filename).toMatch(/^\d+-[0-9a-f]{16}\.png$/); // extension from the mimetype, not from "x.html"
      const served = await api.get(`/api/uploads/${res.body.filename}`);
      expect(served.status).toBe(200);
      expect(served.headers['content-type']).toBe('image/png');

      const html = await api
        .post('/api/uploads')
        .set(u.auth)
        .attach('image', Buffer.from('<script>1</script>'), {
          filename: 'x.html',
          contentType: 'text/html',
        });
      expect(html.status).toBe(400);

      const multi = await api
        .post('/api/uploads/multiple')
        .set(u.auth)
        .attach('images', png, { filename: 'a.png', contentType: 'image/png' })
        .attach('images', png, { filename: 'b.png', contentType: 'image/png' });
      expect(multi.status).toBe(201);
      expect(JSON.stringify(multi.body)).not.toMatch(
        /path|destination|\/images/,
      ); // no server paths
    });

    it('only an admin can delete, and "../" cannot escape the folder', async () => {
      const u = await makeUser();
      const admin = await makeUser({ role: UserType.ADMIN });
      const victim = join(process.cwd(), 'victim-e2e.txt');
      writeFileSync(victim, 'important');
      try {
        expect(
          (await api.delete('/api/uploads/..%2Fvictim-e2e.txt').set(admin.auth))
            .status,
        ).toBe(404);
        expect(
          (await api.delete('/api/uploads/..%2Fvictim-e2e.txt').set(u.auth))
            .status,
        ).toBe(403);
        expect(existsSync(victim)).toBe(true);
        expect((await api.get('/api/uploads/..%2Fvictim-e2e.txt')).status).toBe(
          404,
        );
      } finally {
        unlinkSync(victim);
      }

      mkdirSync('images', { recursive: true });
      const up = await api
        .post('/api/uploads')
        .set(u.auth)
        .attach('image', png, { filename: 'a.png', contentType: 'image/png' });
      expect(
        (await api.delete(`/api/uploads/${up.body.filename}`).set(u.auth))
          .status,
      ).toBe(403);
      expect(
        (await api.delete(`/api/uploads/${up.body.filename}`).set(admin.auth))
          .status,
      ).toBe(200);
      expect(
        (await api.delete(`/api/uploads/${up.body.filename}`).set(admin.auth))
          .status,
      ).toBe(404);
    });
  });

  // =====================================================================
  describe('categories and products', () => {
    let admin: Awaited<ReturnType<typeof makeUser>>;
    beforeAll(async () => {
      admin = await makeUser({ role: UserType.ADMIN });
    });

    it('category CRUD is admin only; the name is unique (409)', async () => {
      const user = await makeUser();
      expect(
        (
          await api
            .post('/api/categories')
            .set(user.auth)
            .send({ name: 'Books' })
        ).status,
      ).toBe(403);
      expect(
        (await api.post('/api/categories').send({ name: 'Books' })).status,
      ).toBe(401);
      const created = await api
        .post('/api/categories')
        .set(admin.auth)
        .send({ name: 'Books', description: 'all books' });
      expect(created.status).toBe(201);
      expect(
        (
          await api
            .post('/api/categories')
            .set(admin.auth)
            .send({ name: 'Books' })
        ).status,
      ).toBe(409);
      expect(
        (await api.get(`/api/categories/${created.body.id}`)).body.name,
      ).toBe('Books');
      expect((await api.get('/api/categories/999999')).status).toBe(404);
      const upd = await api
        .put(`/api/categories/${created.body.id}`)
        .set(admin.auth)
        .send({ description: 'new' });
      expect(upd.body.description).toBe('new');
      expect(
        (await api.delete(`/api/categories/${created.body.id}`).set(admin.auth))
          .status,
      ).toBe(200);
    });

    it('products: validation of strange values', async () => {
      const bad = [
        { title: 'ab', description: 'd', price: -1 },
        { title: 'abc', description: 'd', price: 5, stock: -1 },
        { title: 'abc', description: 'd', price: 5, stock: 1.5 },
        { title: 'abc', description: '', price: 5 },
        { title: 'abc', description: 'd', price: '5' },
        { title: '', description: 'd', price: 5 },
        { title: 'abc', description: 'd', price: 5, categoryId: 0 },
      ];
      for (const body of bad) {
        expect(
          (await api.post('/api/products').set(admin.auth).send(body)).status,
        ).toBe(400);
      }
      expect(
        (
          await api.post('/api/products').set(admin.auth).send({
            title: 'abc',
            description: 'd',
            price: 5,
            categoryId: 999999,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await api
            .post('/api/products')
            .set((await makeUser()).auth)
            .send({ title: 'abc', description: 'd', price: 5 })
        ).status,
      ).toBe(403);
    });

    it('search ignores letter case, treats % and _ as normal characters', async () => {
      const marker = `Zeta${Date.now()}`;
      await makeProduct(admin, { title: `${marker} Laptop` });
      await makeProduct(admin, { title: `${marker} 100%_off` });
      expect(
        (
          await api
            .get('/api/products')
            .query({ title: `${marker.toUpperCase()} laptop` })
        ).body,
      ).toHaveLength(1);
      expect(
        (await api.get('/api/products').query({ title: `${marker} Laptop` }))
          .body,
      ).toHaveLength(1);
      expect(
        (await api.get('/api/products').query({ title: '100%_' })).body,
      ).toHaveLength(1);
      expect(
        (await api.get('/api/products').query({ title: `${marker}%` })).body,
      ).toHaveLength(0); // "%" is not a wildcard
    });

    it('filters (min only, max only, range, category), sort and pagination with X-Total-Count', async () => {
      const cat = (
        await api
          .post('/api/categories')
          .set(admin.auth)
          .send({ name: `Cat ${Date.now()}` })
      ).body;
      const tag = `pg${Date.now()}`;
      for (const [i, price] of [5, 15, 25, 35].entries()) {
        await makeProduct(admin, {
          title: `${tag} item ${i}`,
          price,
          categoryId: cat.id,
        });
      }
      const list = (params: Record<string, unknown>) =>
        api.get('/api/products').query({ categoryId: cat.id, ...params });

      expect((await list({})).headers['x-total-count']).toBe('4');
      expect(
        (await list({ minPrice: 20 })).body.map((p: any) => p.price).sort(),
      ).toEqual([25, 35]);
      expect(
        (await list({ maxPrice: 15 })).body
          .map((p: any) => p.price)
          .sort((a: number, b: number) => a - b),
      ).toEqual([5, 15]);
      expect((await list({ minPrice: 10, maxPrice: 30 })).body).toHaveLength(2);
      expect((await list({ minPrice: 30, maxPrice: 10 })).status).toBe(400);

      const page = await list({
        sortBy: 'price',
        order: 'ASC',
        page: 2,
        limit: 3,
      });
      expect(page.body.map((p: any) => p.price)).toEqual([35]);
      expect(page.headers['x-total-count']).toBe('4');
      expect(page.body[0].category.id).toBe(cat.id);

      for (const bad of [
        { page: -3 },
        { page: 0 },
        { limit: 1000 },
        { limit: 'abc' },
        { sortBy: 'password' },
        { order: 'x' },
        { minPrice: 'abc' },
        { evil: 1 },
      ]) {
        expect((await api.get('/api/products').query(bad)).status).toBe(400);
      }

      // deleting a category keeps its products
      expect(
        (await api.delete(`/api/categories/${cat.id}`).set(admin.auth)).status,
      ).toBe(200);
      const after = await api
        .get('/api/products')
        .query({ title: `${tag} item 0` });
      expect(after.body[0].category).toBeNull();
    });

    it('update: stock, category (set and remove), 404 and validation', async () => {
      const cat = (
        await api
          .post('/api/categories')
          .set(admin.auth)
          .send({ name: `U ${Date.now()}` })
      ).body;
      const p = await makeProduct(admin, { price: 8 });
      const upd = await api
        .put(`/api/products/${p.id}`)
        .set(admin.auth)
        .send({ stock: 9, categoryId: cat.id, title: 'NEW Title' });
      expect(upd.status).toBe(200);
      expect(upd.body.stock).toBe(9);
      expect(upd.body.title).toBe('new title');
      expect(upd.body.category.id).toBe(cat.id);
      expect(
        (
          await api
            .put(`/api/products/${p.id}`)
            .set(admin.auth)
            .send({ categoryId: null })
        ).body.category,
      ).toBeNull();
      expect(
        (
          await api
            .put(`/api/products/${p.id}`)
            .set(admin.auth)
            .send({ stock: -5 })
        ).status,
      ).toBe(400);
      expect(
        (
          await api
            .put('/api/products/999999')
            .set(admin.auth)
            .send({ stock: 1 })
        ).status,
      ).toBe(404);
      expect((await api.get('/api/products/abc')).status).toBe(400);
      expect(
        (await api.delete(`/api/products/${p.id}`).set(admin.auth)).status,
      ).toBe(200);
      initialStock.delete(p.id);
    });
  });

  // =====================================================================
  describe('reviews', () => {
    let admin: Awaited<ReturnType<typeof makeUser>>;
    let product: { id: number };
    beforeAll(async () => {
      admin = await makeUser({ role: UserType.ADMIN });
      product = await makeProduct(admin);
    });

    it('validation: rating 1..5 integers, comment length', async () => {
      const u = await makeUser();
      for (const body of [
        { rating: 0, comment: 'abc' },
        { rating: 6, comment: 'abc' },
        { rating: 2.5, comment: 'abc' },
        { rating: 3, comment: 'a' },
        { rating: 3 },
        { comment: 'abc' },
        { rating: 3, comment: 'x'.repeat(1001) },
      ]) {
        expect(
          (await api.post(`/api/reviews/${product.id}`).set(u.auth).send(body))
            .status,
        ).toBe(400);
      }
      expect(
        (
          await api
            .post('/api/reviews/999999')
            .set(u.auth)
            .send({ rating: 3, comment: 'abc' })
        ).status,
      ).toBe(404);
      expect(
        (
          await api
            .post(`/api/reviews/${product.id}`)
            .send({ rating: 3, comment: 'abc' })
        ).status,
      ).toBe(401);
    });

    it('one review per user and product: 10 parallel requests -> exactly one is created', async () => {
      const u = await makeUser();
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          api
            .post(`/api/reviews/${product.id}`)
            .set(u.auth)
            .send({ rating: 5, comment: 'great' }),
        ),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(9);
      expect(
        await q(
          `SELECT id FROM reviews WHERE "userId" = $1 AND "productId" = $2`,
          [u.user.id, product.id],
        ),
      ).toHaveLength(1);
    });

    it('only the author edits (403), the author or an admin deletes; pagination is validated', async () => {
      const author = await makeUser();
      const other = await makeUser();
      const review = (
        await api
          .post(`/api/reviews/${product.id}`)
          .set(author.auth)
          .send({ rating: 2, comment: 'meh meh' })
      ).body;
      expect(
        (
          await api
            .put(`/api/reviews/${review.id}`)
            .set(other.auth)
            .send({ rating: 5 })
        ).status,
      ).toBe(403);
      const upd = await api
        .put(`/api/reviews/${review.id}`)
        .set(author.auth)
        .send({ rating: 4 });
      expect(upd.status).toBe(200);
      expect(upd.body.rating).toBe(4);
      expect(JSON.stringify(upd.body)).not.toContain(
        author.user.password ?? 'never',
      );
      expect(
        (await api.delete(`/api/reviews/${review.id}`).set(other.auth)).status,
      ).toBe(403);
      expect(
        (await api.delete(`/api/reviews/${review.id}`).set(admin.auth)).status,
      ).toBe(200);
      expect(
        (await api.get(`/api/reviews/${review.id}`).set(author.auth)).status,
      ).toBe(404);

      expect((await api.get('/api/reviews').set(author.auth)).status).toBe(403);
      for (const bad of [
        { page: -3 },
        { limit: 0 },
        { limit: 101 },
        { page: 'abc' },
      ]) {
        expect(
          (await api.get('/api/reviews').set(admin.auth).query(bad)).status,
        ).toBe(400);
      }
      const list = await api
        .get('/api/reviews')
        .set(admin.auth)
        .query({ page: 1, limit: 2 });
      expect(list.status).toBe(200);
      expect(list.body.length).toBeLessThanOrEqual(2);
    });
  });

  // =====================================================================
  describe('cart', () => {
    let admin: Awaited<ReturnType<typeof makeUser>>;
    beforeAll(async () => {
      admin = await makeUser({ role: UserType.ADMIN });
    });

    it('needs a login; add / accumulate / limits / set / remove / clear', async () => {
      expect((await api.get('/api/cart')).status).toBe(401);
      const u = await makeUser();
      const p = await makeProduct(admin, { price: 10.1, stock: 100 });

      let res = await addToCart(u, p.id, 2);
      expect(res.status).toBe(201);
      res = await addToCart(u, p.id, 3);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].quantity).toBe(5);
      expect(res.body.total).toBe(50.5);

      expect((await addToCart(u, p.id, 0)).status).toBe(400);
      expect((await addToCart(u, p.id, 100)).status).toBe(400);
      expect((await addToCart(u, 999999, 1)).status).toBe(404);
      expect((await addToCart(u, p.id, 95)).status).toBe(400); // 5 + 95 > 99
      expect(
        (await api.get('/api/cart').set(u.auth)).body.items[0].quantity,
      ).toBe(5);

      res = await api
        .put(`/api/cart/${p.id}`)
        .set(u.auth)
        .send({ quantity: 7 });
      expect(res.body.items[0].quantity).toBe(7);
      expect(
        (await api.put('/api/cart/999999').set(u.auth).send({ quantity: 1 }))
          .status,
      ).toBe(404);
      expect(
        (await api.put(`/api/cart/${p.id}`).set(u.auth).send({ quantity: 0 }))
          .status,
      ).toBe(400);

      expect(
        (await api.delete(`/api/cart/${p.id}`).set(u.auth)).body.items,
      ).toEqual([]);
      expect((await api.delete(`/api/cart/${p.id}`).set(u.auth)).status).toBe(
        404,
      );
      await addToCart(u, p.id, 1);
      expect((await api.delete('/api/cart').set(u.auth)).status).toBe(200);
      expect((await api.get('/api/cart').set(u.auth)).body).toEqual({
        items: [],
        total: 0,
      });
    });

    it('carts are private and 20 parallel adds do not lose updates', async () => {
      const a = await makeUser();
      const b = await makeUser();
      const p = await makeProduct(admin, { stock: 100 });
      await Promise.all(
        Array.from({ length: 20 }, () => addToCart(a, p.id, 1)),
      );
      expect(
        (await api.get('/api/cart').set(a.auth)).body.items[0].quantity,
      ).toBe(20);
      expect((await api.get('/api/cart').set(b.auth)).body.items).toEqual([]);
    });
  });

  // =====================================================================
  describe('orders', () => {
    let admin: Awaited<ReturnType<typeof makeUser>>;
    beforeAll(async () => {
      admin = await makeUser({ role: UserType.ADMIN });
    });

    const stockOf = async (id: number) =>
      (await q(`SELECT stock FROM products WHERE id = $1`, [id]))[0]
        .stock as number;

    it('checkout: stock goes down, total is exact, cart is emptied, price is a snapshot', async () => {
      const u = await makeUser();
      const p1 = await makeProduct(admin, { price: 10.1, stock: 10 });
      const p2 = await makeProduct(admin, { price: 0.2, stock: 10 });
      await addToCart(u, p1.id, 3);
      await addToCart(u, p2.id, 3);

      const res = await checkout(u);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('pending');
      expect(res.body.totalPrice).toBe(30.9); // 3 x 10.10 + 3 x 0.20, no float error
      expect(res.body.items).toHaveLength(2);
      expect(await stockOf(p1.id)).toBe(7);
      expect(await stockOf(p2.id)).toBe(7);
      expect((await api.get('/api/cart').set(u.auth)).body.items).toEqual([]);

      // later changes of the product do not change the order
      await api
        .put(`/api/products/${p1.id}`)
        .set(admin.auth)
        .send({ price: 99, title: 'renamed' });
      const again = await api.get(`/api/orders/${res.body.id}`).set(u.auth);
      expect(again.body.totalPrice).toBe(30.9);
      expect(
        again.body.items.find((i: any) => i.productId === p1.id).unitPrice,
      ).toBe(10.1);

      // product deleted later: the order stays
      await api.delete(`/api/products/${p2.id}`).set(admin.auth);
      initialStock.delete(p2.id);
      const kept = await api.get(`/api/orders/${res.body.id}`).set(u.auth);
      expect(kept.body.items).toHaveLength(2);
      await assertConsistency();
    });

    it('empty cart -> 400; not enough stock -> 409 and NOTHING changes (cart and stock kept)', async () => {
      const u = await makeUser();
      expect((await checkout(u)).status).toBe(400);

      const ok = await makeProduct(admin, { stock: 5 });
      const scarce = await makeProduct(admin, { stock: 1 });
      await addToCart(u, ok.id, 2);
      await addToCart(u, scarce.id, 2);

      const res = await checkout(u);
      expect(res.status).toBe(409);
      expect(await stockOf(ok.id)).toBe(5); // rolled back, even though it was processed first
      expect(await stockOf(scarce.id)).toBe(1);
      expect((await api.get('/api/cart').set(u.auth)).body.items).toHaveLength(
        2,
      );
      expect(
        await q(`SELECT id FROM orders WHERE "userId" = $1`, [u.user.id]),
      ).toEqual([]);

      expect(
        (
          await api
            .post('/api/orders')
            .set(u.auth)
            .send({ shippingAddress: 'x' })
        ).status,
      ).toBe(400);
      await assertConsistency();
    });

    it('cancel gives the stock back once; the status flow is enforced; orders are private', async () => {
      const u = await makeUser();
      const other = await makeUser();
      const p = await makeProduct(admin, { stock: 10 });
      await addToCart(u, p.id, 4);
      const order = (await checkout(u)).body;
      expect(await stockOf(p.id)).toBe(6);

      expect(
        (await api.get(`/api/orders/${order.id}`).set(other.auth)).status,
      ).toBe(403);
      expect(
        (await api.post(`/api/orders/${order.id}/cancel`).set(other.auth))
          .status,
      ).toBe(403);
      expect(
        (
          await api
            .patch(`/api/orders/${order.id}/status`)
            .set(u.auth)
            .send({ status: 'paid' })
        ).status,
      ).toBe(403);
      expect((await api.get('/api/orders/999999').set(u.auth)).status).toBe(
        404,
      );
      expect((await api.get('/api/orders/me').set(u.auth)).body).toHaveLength(
        1,
      );
      expect((await api.get('/api/orders/me').set(other.auth)).body).toEqual(
        [],
      );

      const cancelled = await api
        .post(`/api/orders/${order.id}/cancel`)
        .set(u.auth);
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.status).toBe('cancelled');
      expect(await stockOf(p.id)).toBe(10);
      expect(
        (await api.post(`/api/orders/${order.id}/cancel`).set(u.auth)).status,
      ).toBe(409);
      expect(await stockOf(p.id)).toBe(10); // not given back twice

      // flow
      await addToCart(u, p.id, 1);
      const o2 = (await checkout(u)).body;
      const status = (to: string) =>
        api
          .patch(`/api/orders/${o2.id}/status`)
          .set(admin.auth)
          .send({ status: to });
      expect((await status('shipped')).status).toBe(409); // pending -> shipped is not allowed
      expect((await status('bogus')).status).toBe(400);
      expect((await status('paid')).body.status).toBe('paid');
      expect((await status('shipped')).body.status).toBe('shipped');
      expect(
        (await api.post(`/api/orders/${o2.id}/cancel`).set(u.auth)).status,
      ).toBe(409); // too late
      expect((await status('delivered')).body.status).toBe('delivered');
      expect((await status('paid')).status).toBe(409);

      // admin cancel of a paid order gives stock back too
      await addToCart(u, p.id, 2);
      const o3 = (await checkout(u)).body;
      await api
        .patch(`/api/orders/${o3.id}/status`)
        .set(admin.auth)
        .send({ status: 'paid' });
      const before = await stockOf(p.id);
      expect(
        (
          await api
            .patch(`/api/orders/${o3.id}/status`)
            .set(admin.auth)
            .send({ status: 'cancelled' })
        ).status,
      ).toBe(200);
      expect(await stockOf(p.id)).toBe(before + 2);

      // admin list + filters
      const all = await api
        .get('/api/orders')
        .set(admin.auth)
        .query({ userId: u.user.id, status: 'cancelled', limit: 1 });
      expect(all.status).toBe(200);
      expect(all.body).toHaveLength(1);
      expect(Number(all.headers['x-total-count'])).toBe(2);
      expect((await api.get('/api/orders').set(u.auth)).status).toBe(403);
      expect(
        (await api.get('/api/orders').set(admin.auth).query({ status: 'nope' }))
          .status,
      ).toBe(400);
      await assertConsistency();
    });

    it('deleting a user keeps the order history (and the stock accounting)', async () => {
      const u = await makeUser();
      const p = await makeProduct(admin, { stock: 3 });
      await addToCart(u, p.id, 2);
      const order = (await checkout(u)).body;
      expect(
        (await api.delete(`/api/users/${u.user.id}`).set(admin.auth)).status,
      ).toBe(200);
      const [row] = await q(`SELECT "userId" FROM orders WHERE id = $1`, [
        order.id,
      ]);
      expect(row.userId).toBeNull();
      await assertConsistency();
    });
  });

  // =====================================================================
  describe('concurrency (many requests at the same moment)', () => {
    let admin: Awaited<ReturnType<typeof makeUser>>;
    beforeAll(async () => {
      admin = await makeUser({ role: UserType.ADMIN });
    });

    it('40 buyers, 10 items in stock -> exactly 10 orders, stock 0, no 5xx', async () => {
      const p = await makeProduct(admin, { price: 3.3, stock: 10 });
      const buyers = await Promise.all(
        Array.from({ length: 40 }, () => makeUser()),
      );
      await Promise.all(buyers.map((b) => addToCart(b, p.id, 1)));

      const results = await Promise.all(buyers.map((b) => checkout(b)));
      expect(results.filter((r) => r.status === 201)).toHaveLength(10);
      expect(results.filter((r) => r.status === 409)).toHaveLength(30);
      expect(results.filter((r) => r.status >= 500)).toHaveLength(0);

      expect(
        (await q(`SELECT stock FROM products WHERE id = $1`, [p.id]))[0].stock,
      ).toBe(0);
      expect(
        (
          await q(
            `SELECT count(*)::int AS n FROM order_items WHERE "productId" = $1`,
            [p.id],
          )
        )[0].n,
      ).toBe(10);
      // the 30 who lost still have their cart
      const losers = buyers.filter((_b, i) => results[i].status === 409);
      for (const l of losers.slice(0, 5)) {
        expect(
          (await api.get('/api/cart').set(l.auth)).body.items,
        ).toHaveLength(1);
      }
      await assertConsistency();
    });

    it('buyers wanting different quantities of the same product never oversell', async () => {
      const p = await makeProduct(admin, { stock: 25 });
      const buyers = await Promise.all(
        Array.from({ length: 30 }, () => makeUser()),
      );
      await Promise.all(buyers.map((b, i) => addToCart(b, p.id, (i % 4) + 1)));
      const results = await Promise.all(buyers.map((b) => checkout(b)));
      expect(results.filter((r) => r.status >= 500)).toHaveLength(0);
      const [row] = await q(`SELECT stock FROM products WHERE id = $1`, [p.id]);
      expect(row.stock).toBeGreaterThanOrEqual(0);
      await assertConsistency();
    });

    it('10 parallel checkouts of the same cart (double click) -> exactly one order', async () => {
      const u = await makeUser();
      const p = await makeProduct(admin, { stock: 10 });
      await addToCart(u, p.id, 3);
      const results = await Promise.all(
        Array.from({ length: 10 }, () => checkout(u)),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 400)).toHaveLength(9); // "cart is empty"
      expect(results.filter((r) => r.status >= 500)).toHaveLength(0);
      expect(
        (await q(`SELECT stock FROM products WHERE id = $1`, [p.id]))[0].stock,
      ).toBe(7);
      expect(
        await q(`SELECT id FROM orders WHERE "userId" = $1`, [u.user.id]),
      ).toHaveLength(1);
      await assertConsistency();
    });

    it('10 parallel cancels of one order -> one wins, stock returns once', async () => {
      const u = await makeUser();
      const p = await makeProduct(admin, { stock: 10 });
      await addToCart(u, p.id, 6);
      const order = (await checkout(u)).body;
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          api.post(`/api/orders/${order.id}/cancel`).set(u.auth),
        ),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(9);
      expect(
        (await q(`SELECT stock FROM products WHERE id = $1`, [p.id]))[0].stock,
      ).toBe(10);
      await assertConsistency();
    });

    it('cancel and checkout at the same time on shared products: no deadlock, stock stays correct', async () => {
      const a = await makeProduct(admin, { stock: 20 });
      const b = await makeProduct(admin, { stock: 20 });
      const people = await Promise.all(
        Array.from({ length: 24 }, () => makeUser()),
      );

      // first, 12 people order [a, b] and then cancel while the other 12 buy in the opposite order
      const first = people.slice(0, 12);
      const second = people.slice(12);
      for (const u of first) {
        await addToCart(u, a.id, 1);
        await addToCart(u, b.id, 1);
      }
      const orders = await Promise.all(first.map((u) => checkout(u)));
      expect(orders.every((o) => o.status === 201)).toBe(true);
      for (const u of second) {
        await addToCart(u, b.id, 2); // added in opposite order
        await addToCart(u, a.id, 2);
      }

      const results = await Promise.all([
        ...first.map((u, i) =>
          api.post(`/api/orders/${orders[i].body.id}/cancel`).set(u.auth),
        ),
        ...second.map((u) => checkout(u)),
      ]);
      expect(results.filter((r) => r.status >= 500)).toHaveLength(0);
      await assertConsistency();
    });
  });

  // =====================================================================
  describe('time zones', () => {
    it(
      'createdAt is the real time whatever the time zone of the server (TZ=' +
        (process.env.TZ ?? 'default') +
        ')',
      async () => {
        const u = await makeUser();
        const admin = await makeUser({ role: UserType.ADMIN });
        const p = await makeProduct(admin);
        const before = Date.now();
        const res = await api
          .post(`/api/reviews/${p.id}`)
          .set(u.auth)
          .send({ rating: 4, comment: 'tz check' });
        const created = new Date(res.body.createdAt).getTime();
        expect(Math.abs(created - before)).toBeLessThan(10_000);
        const [row] = await q(
          `SELECT data_type FROM information_schema.columns WHERE table_name = 'reviews' AND column_name = 'createdAt'`,
        );
        expect(row.data_type).toBe('timestamp with time zone');
      },
    );
  });

  // =====================================================================
  describe('final consistency check', () => {
    it('stock, orders and items agree across the whole database', async () => {
      await assertConsistency();
      expect(
        await q(
          `SELECT id FROM reviews GROUP BY "userId", "productId", id HAVING count(*) > 1`,
        ),
      ).toEqual([]);
      expect(
        await q(
          `SELECT "userId", "productId" FROM reviews GROUP BY "userId", "productId" HAVING count(*) > 1`,
        ),
      ).toEqual([]);
      expect(
        await q(
          `SELECT id FROM cart_items WHERE quantity < 1 OR quantity > 99`,
        ),
      ).toEqual([]);
    });
  });
});
