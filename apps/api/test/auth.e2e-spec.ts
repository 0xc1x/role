import { randomUUID } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthResponseSchema } from '@0xc1x/role-commons';
import type { Express } from 'express';
import { SignJWT } from 'jose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { createTestDb, type TestDbContext } from './db';
import { seedProfile } from './seed';

/**
 * E2E of the real sign-in path: `POST /api/v1/auth/login` over HTTP, against a
 * live endpoint that speaks GoTrue's response shape.
 *
 * WHY THIS FILE EXISTS AND WHAT IT MAY NOT DUPLICATE. `auth.service.spec.ts`
 * already has eleven login/refresh/logout cases, and `auth.controller.spec.ts`
 * covers the controller in isolation. Neither can see the wiring: what the
 * `ZodValidationPipe` answers before the handler runs, that the `@Throttle`
 * decorator is on this route at all, how `AuthService` maps a GoTrue status onto
 * an HTTP one, and — the part that matters most — whether the JSON on this wire
 * is the JSON `apps/admin/src/features/auth/server.ts` accepts. That admin code
 * runs `AuthResponseSchema.safeParse(json)` and throws
 * `Error("Respuesta de autenticación inválida")` to the operator when it does
 * not, and until now NOTHING in the repository ran that schema against a real
 * login response. Two apps, one contract, no test.
 *
 * THE STUB, AND WHY IT IS AN HTTP SERVER RATHER THAN A MOCK.
 * `AuthService` builds its Supabase clients with `createClient(url, anonKey)`
 * inside its own constructor and reads `process.env.SUPABASE_URL` there, so
 * there is no seam to inject: `overrideProvider` cannot reach it. Pointing
 * `SUPABASE_URL` at a local server that answers like GoTrue keeps `supabase-js`
 * running unmodified and exercises its real parsing — the epoch `expires_at`,
 * the `user` object, the error shape per status — which is exactly the layer a
 * hand-written mock of `signInWithPassword` throws away. The stub models ONE
 * endpoint in ~90 lines; if a second one is ever needed, the honest move is a
 * client-injection seam in `AuthService`, not a second hand-rolled route here.
 *
 * Requires the test Postgres (`docker compose up postgres-test`). The throttle
 * answers from Redis when `REDIS_URL` is set and from the in-memory map when it
 * is not (CI ships no Redis), and nothing below asserts which one ran: the
 * number the `@Throttle` decorator sets is the thing under test.
 */

/** The same secret the sibling e2e signs with, so both suites agree on a token. */
const JWT_SECRET = 'e2e-test-secret';

/**
 * GoTrue answers `expires_at` in SECONDS since the epoch and `AuthService`
 * multiplies it by 1000 before it reaches the client. A fixed value, far enough
 * ahead to be a live session and deliberately not `now + 3600`: with a relative
 * one the assertion could only compare the API's arithmetic against itself, and
 * a conversion that lost the ×1000 would still produce a plausible-looking date.
 */
const GOTRUE_EXPIRES_AT = 1_893_456_000; // 2030-01-01T00:00:00.000Z
const GOTRUE_EXPIRES_IN = 3600;

const CONSUMER_EMAIL = 'e2e-login-consumer@t.cl';
const ADMIN_EMAIL = 'e2e-login-admin@t.cl';
const ORPHAN_EMAIL = 'e2e-login-orphan@t.cl';
const PASSWORD = 'correcta-1';

interface GoTrueCall {
  method: string;
  pathname: string;
  grantType: string | null;
  body: Record<string, unknown>;
}

interface GoTrueSubject {
  id: string;
  email: string;
  phone?: string;
  userMetadata?: Record<string, unknown>;
}

type GoTrueReply = { status: number; body: Record<string, unknown> };

/**
 * A GoTrue stand-in for ONE endpoint, `POST /auth/v1/token?grant_type=password`.
 *
 * It signs the access token itself because that is GoTrue's job: the token the
 * API hands the admin has to be a token GoTrue would really have minted, signed
 * with the project's JWT secret and carrying the claims
 * `SupabaseTokenVerifier` checks. Minting it in the spec instead would let the
 * two drift, and the positive assertion in "the access token a login returns
 * opens a protected route" would prove nothing about the login at all.
 */
async function startGotrueStub(options: { jwtSecret: string }) {
  const calls: GoTrueCall[] = [];
  let reply: GoTrueReply = {
    status: 500,
    body: { code: 500, msg: 'the stub was never told what to answer' },
  };

  const send = (res: ServerResponse, status: number, body: unknown) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
    });
    res.end(payload);
  };

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {
        body = {};
      }
      calls.push({
        method: req.method ?? 'GET',
        pathname: url.pathname,
        grantType: url.searchParams.get('grant_type'),
        body,
      });

      // Anything else is a 404 that NAMES what it had no stub for. A route that
      // quietly answered nothing would let the suite go green while exercising
      // nothing, and the first surprise `supabase-js` has — a JWKS fetch, a
      // session probe — would land here instead of in a false pass.
      if (req.method !== 'POST' || url.pathname !== '/auth/v1/token') {
        return send(res, 404, {
          code: 404,
          msg: `no GoTrue stub for ${req.method} ${url.pathname}`,
        });
      }
      return send(res, reply.status, reply.body);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  const issuer = `${url}/auth/v1`;

  return {
    url,
    calls,
    reset: () => {
      calls.length = 0;
    },
    /** Answers the next sign-in the way GoTrue answers a good password. */
    serveSession: async (
      subject: GoTrueSubject,
      overrides: { expiresAt?: number } = {},
    ) => {
      const accessToken = await new SignJWT({
        email: subject.email,
        // The claim GoTrue puts on every session token. `SupabaseTokenVerifier`
        // does not read it, so nothing asserts it; it is here so the token this
        // suite hands the API is a token GoTrue would really have signed.
        role: 'authenticated',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer(issuer)
        .setAudience('authenticated')
        .setSubject(subject.id)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode(options.jwtSecret));
      const now = new Date().toISOString();

      reply = {
        status: 200,
        body: {
          access_token: accessToken,
          token_type: 'bearer',
          expires_in: GOTRUE_EXPIRES_IN,
          expires_at: overrides.expiresAt ?? GOTRUE_EXPIRES_AT,
          refresh_token: `refresh-${randomUUID()}`,
          user: {
            id: subject.id,
            aud: 'authenticated',
            role: 'authenticated',
            email: subject.email,
            email_confirmed_at: now,
            phone: subject.phone ?? '',
            confirmed_at: now,
            last_sign_in_at: now,
            app_metadata: { provider: 'email', providers: ['email'] },
            user_metadata: subject.userMetadata ?? {},
            identities: [],
            created_at: now,
            updated_at: now,
            is_anonymous: false,
          },
        },
      };
    },
    /** Answers the next sign-in with the status and body GoTrue would send. */
    refuseWith: (status: number, body: Record<string, unknown>) => {
      reply = { status, body };
    },
    stop: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

type Gotrue = Awaited<ReturnType<typeof startGotrueStub>>;

/**
 * One distinct `X-Forwarded-For` per caller.
 *
 * `ThrottlerGuard` keys on `req.ip`, and the login route's whole budget is five
 * requests a minute. Every request in this file leaves through the same socket,
 * so without this the sixth login in the file would 429 the seventh and the
 * suite would be asserting on its own execution order.
 *
 * IPv6, and randomised per run, because the counters outlive the process whenever
 * `REDIS_URL` is set: they sit in Redis under a 60s TTL, so a fixed address
 * would let a re-run inside that window inherit the previous run's budget and the
 * "fifth is served" case would fail for a reason that has nothing to do with the
 * code. `normalizeIp` masks a v6 address to its /64 before it becomes a key, so
 * one random /64 per run gives this suite 2^32 throttle namespaces and leaves
 * the last 64 bits free for the per-test sequence below. RFC 3847's `2001:db8::/32`
 * is the documentation prefix.
 */
const RUN_PREFIX = `2001:db8:${randomUUID().slice(0, 4)}:${randomUUID().slice(0, 4)}`;
let ipSequence = 0;
function nextIp(): string {
  ipSequence += 1;
  return `${RUN_PREFIX}::${ipSequence.toString(16)}`;
}

let ctx: TestDbContext;
let gotrue: Gotrue;
let app: INestApplication<App>;
let consumerId: string;
let adminId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  gotrue = await startGotrueStub({ jwtSecret: JWT_SECRET });

  process.env.DATABASE_URL = ctx.connectionString;
  process.env.SUPABASE_URL = gotrue.url;
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.SUPABASE_ANON_KEY = 'e2e-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'e2e-service';
  process.env.NODE_ENV = 'test';

  consumerId = await seedProfile(ctx.db, CONSUMER_EMAIL);
  adminId = await seedProfile(ctx.db, ADMIN_EMAIL);
  // `role` and `full_name` are what the admin's session drives its whole UI
  // from, so they are written here the way every other spec in this harness
  // writes a column the API exposes no endpoint for.
  await ctx.db.execute(
    `update profiles set role = 'admin', full_name = 'Panel' where id = '${adminId}'`,
  );

  // Dynamic import AFTER the env is set: `ConfigModule` freezes the variables
  // when `app.module` is evaluated, and importing it at the top of the file lets
  // `apps/api/.env` win over the stub's URL. Same shape as `app.e2e-spec.ts`.
  const { AppModule } = await import('../src/app.module');
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();
  // The two pieces of `main.ts` this route's behaviour depends on, and the ones
  // the sibling e2e never installs: the filter that redacts every 5xx body, and
  // the proxy trust that makes `X-Forwarded-For` — and therefore the per-IP
  // throttle — behave the way they do behind Render.
  (app.getHttpAdapter().getInstance() as Express).set('trust proxy', 1);
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  // Wait for the throttle backend before any assertion depends on it, and do it
  // on `/health` rather than on login so the login bucket is left pristine for
  // the 429 case below.
  //
  // `RedisThrottlerStorage` builds its client with `enableOfflineQueue: false`,
  // so the first command issued after boot — which is the first request through
  // `ThrottlerGuard` — is refused with "Stream isn't writeable and
  // enableOfflineQueue options is false", and the request answers 500. It is a
  // real race and not this file's subject, but it is why the sibling e2e only
  // escapes it by accident: it spends several round trips against Postgres
  // between `init()` and its first request, which is time enough for the socket.
  // The first login here is milliseconds after `init()` and paid for it.
  //
  // With no `REDIS_URL` the storage answers from its in-memory map and this loop
  // succeeds on the first hit, which is what CI does (it ships no Redis).
  let throttleReady = false;
  for (let attempt = 0; attempt < 40 && !throttleReady; attempt += 1) {
    const warm = await request(app.getHttpServer()).get('/api/v1/health');
    throttleReady = warm.status === 200;
    if (!throttleReady) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  // Failing HERE rather than letting the first login fail: a throttle backend
  // that never came up is a different defect from a login that answers 500, and
  // a suite that cannot tell them apart diagnoses the wrong one.
  if (!throttleReady) {
    throw new Error(
      'The throttle backend never became writeable; /api/v1/health is still not 200 after 2s',
    );
  }
}, 120000);

afterAll(async () => {
  await app?.close();
  await gotrue?.stop();
  await ctx?.stop();
});

describe('Login e2e', () => {
  const api = () => request(app.getHttpServer());
  const login = (body: object, ip = nextIp()) =>
    api().post('/api/v1/auth/login').set('X-Forwarded-For', ip).send(body);

  test('a valid login answers 200 with the exact shape the admin validates, and expires_at in ISO', async () => {
    await gotrue.serveSession({ id: consumerId, email: CONSUMER_EMAIL });

    const res = await login({
      email: CONSUMER_EMAIL,
      password: PASSWORD,
    }).expect(200);

    // The EXACT key set, in both blocks — not "it has an access_token". The
    // admin's `parseApiSession` runs a non-strict `z.object`, which strips what
    // it does not recognise instead of refusing it, so a renamed or surplus key
    // survives that parse silently: the schema assertion below proves the
    // VALUES are acceptable, and this one is what makes the SHAPE a contract.
    expect(Object.keys(res.body).sort()).toEqual([
      'access_token',
      'expires_at',
      'expires_in',
      'refresh_token',
      'user',
    ]);
    expect(Object.keys(res.body.user).sort()).toEqual([
      'avatar_url',
      'email',
      'full_name',
      'id',
      'role',
    ]);

    // The contract itself, run on the bytes that came over the wire. This is the
    // assertion that ties the two apps together: `loginFn` in
    // `apps/admin/src/features/auth/server.ts` answers the operator
    // "Respuesta de autenticación inválida" when this parse fails, and no other
    // test in the repository ever put a real login response in front of it.
    expect(AuthResponseSchema.safeParse(res.body).success).toBe(true);

    // `expires_at` is GoTrue's epoch in SECONDS and the admin keeps this string
    // as the session's expiry (`AdminClientSession.expires_at`). `TimestampszSchema`
    // is deliberately a non-empty string, so a bare number would pass the parse
    // above and then be compared as a date by whatever refreshes next: a session
    // that expired in 1970, with no error anywhere.
    expect(res.body.expires_at).toBe(
      new Date(GOTRUE_EXPIRES_AT * 1000).toISOString(),
    );
    expect(res.body.expires_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(res.body.expires_in).toBe(GOTRUE_EXPIRES_IN);
    expect(res.body.user).toEqual({
      id: consumerId,
      email: CONSUMER_EMAIL,
      full_name: null,
      avatar_url: null,
      role: 'user',
    });
  });

  test('the access token a login returns opens a route that requires a session', async () => {
    // The cleanest way to authenticate here is to NOT authenticate: the stub is
    // GoTrue, GoTrue signs the token, and the test then uses the string the
    // login response carried without touching it. Every other e2e in this
    // repository FORGES its bearer with a local helper, so nothing had ever
    // asked the question this asks — whether what the admin stores in
    // `localStorage` is accepted by the guard that runs on its next request.
    await gotrue.serveSession({ id: consumerId, email: CONSUMER_EMAIL });

    const res = await login({
      email: CONSUMER_EMAIL,
      password: PASSWORD,
    }).expect(200);
    const accessToken: string = res.body.access_token;

    const me = await api()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    // The guard resolved the subject against `profiles`, so the identity in the
    // token and the identity the API serves are the same row.
    expect(me.body.user).toEqual({
      id: consumerId,
      email: CONSUMER_EMAIL,
      role: 'user',
    });

    // The control: the same route with a string that is not a token is refused.
    // Without it, a verifier that read the subject out of anything would satisfy
    // the assertion above and this file would be pinning nothing.
    await api()
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer no-es-un-jwt')
      .expect(401);
  });

  test('the request carries what the admin sends: email and password, and nothing else', async () => {
    gotrue.reset();
    await gotrue.serveSession({ id: consumerId, email: CONSUMER_EMAIL });

    // `loginFn`'s validator types the payload as `{ email, password }` and hands
    // it to `apiPost` untouched, so this is byte-for-byte what the panel sends.
    // `role` is not in that type, and it is the one field a client would add to
    // try to promote itself.
    await login({
      email: CONSUMER_EMAIL,
      password: PASSWORD,
      role: 'admin',
    }).expect(200);

    expect(gotrue.calls).toHaveLength(1);
    const call = gotrue.calls[0]!;
    expect(call.method).toBe('POST');
    expect(call.pathname).toBe('/auth/v1/token');
    expect(call.grantType).toBe('password');

    const forwarded = call.body;
    // `role` is gone: `LoginRequestSchema` does not carry it, so the Zod pipe
    // stripped it before the service ever saw the body. The GoTrue call is the
    // only place that could still be leaking it.
    expect(Object.keys(forwarded).sort()).toEqual([
      'email',
      'gotrue_meta_security',
      'password',
    ]);
    expect(forwarded.email).toBe(CONSUMER_EMAIL);
    expect(forwarded.password).toBe(PASSWORD);
    // The captcha field is `supabase-js`'s own and is always present and always
    // empty: `captchaToken` is `undefined`, and `JSON.stringify` drops the key.
    expect(forwarded.gotrue_meta_security).toEqual({});
  });

  test('the body is validated before GoTrue is touched: 400 naming the field, never a 500', async () => {
    gotrue.reset();
    await gotrue.serveSession({ id: consumerId, email: CONSUMER_EMAIL });

    // Five characters. `PasswordSchema` — the one `register` and
    // `reset-password` use — demands eight, and GoTrue's own minimum is six, so
    // login is deliberately the loosest of the three. That asymmetry is a
    // product decision somebody should be able to see, and this is where it is
    // visible. The message is pinned whole, count included, and not with a
    // `stringContaining`: the half of it that matters is the "6", and a loose
    // assertion would let that quietly become the eight of `PasswordSchema` and
    // lock out every account that signed in under the old rule.
    const short = await login({
      email: CONSUMER_EMAIL,
      password: '12345',
    }).expect(400);
    expect(short.body.message).toBe('Validation failed');
    expect(short.body.details).toEqual([
      {
        path: 'password',
        message: 'Too small: expected string to have >=6 characters',
      },
    ]);

    // A 400, not the 422 the shape of other refusals in this API suggests, and
    // not the 500 a missing `try` would produce: `ZodValidationPipe` throws a
    // `BadRequestException` and the handler is never entered. The field is named
    // in `details[].path`, which is the half a form can act on.
    const bad = await login({
      email: 'esto-no-es-un-correo',
      password: '123456',
    }).expect(400);
    expect(bad.body.details).toEqual([
      { path: 'email', message: 'Invalid email address' },
    ]);

    // Six characters is inside the boundary the product set, and proving that
    // needs a request that actually gets past validation: a 400 here would mean
    // the minimum had been quietly raised to `PasswordSchema`'s eight and every
    // account that signed in under the old rule would be locked out.
    const boundary = await login({
      email: CONSUMER_EMAIL,
      password: '123456',
    }).expect(200);
    expect(boundary.body.user.id).toBe(consumerId);

    // One GoTrue call out of three, and it carried the six characters: the pipe
    // answered the other two, so the provider is not what is validating here.
    expect(gotrue.calls).toHaveLength(1);
    expect(gotrue.calls[0]!.body.password).toBe('123456');
  });

  test('the sixth attempt from one IP inside a minute is 429 and the fifth is served', async () => {
    // Its own address, and deliberately so: this is the only case in the file
    // that spends a bucket, and `@Throttle({ default: { limit: 5, ttl: 60000 } })`
    // is keyed per IP. Every other case takes a fresh one.
    const ip = nextIp();
    gotrue.reset();
    await gotrue.serveSession({ id: consumerId, email: CONSUMER_EMAIL });

    // Five served, asserted one by one. A test that only checked the sixth was
    // refused would go green just as happily against a limit of one as against
    // the five somebody chose, and the five is a security number.
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await login({ email: CONSUMER_EMAIL, password: PASSWORD }, ip).expect(
        200,
      );
    }
    expect(gotrue.calls).toHaveLength(5);

    const sixth = await login(
      { email: CONSUMER_EMAIL, password: PASSWORD },
      ip,
    ).expect(429);
    expect(sixth.body.error).toBe('Too Many Requests');
    // The redaction `AllExceptionsFilter` applies to a 429: the class name of
    // the throttler's exception is not an operator-facing message.
    expect(JSON.stringify(sixth.body)).not.toContain('ThrottlerException');

    // Still five. The guard answers before the handler, which is the entire
    // reason the decorator sits on this route: a sixth guess from the same host
    // never reaches GoTrue, so the credential-stuffing loop the limit exists to
    // slow down is stopped one layer earlier than the provider.
    expect(gotrue.calls).toHaveLength(5);
  });

  test('a GoTrue 400 becomes 401 with a message that does not say which half was wrong', async () => {
    gotrue.reset();
    // GoTrue's real body for a rejected password, `msg` included: that string is
    // what `supabase-js` puts in `error.message` and what `AuthService.login`
    // discards.
    gotrue.refuseWith(400, {
      code: 400,
      error_code: 'invalid_credentials',
      msg: 'Invalid login credentials',
    });

    const res = await login({
      email: CONSUMER_EMAIL,
      password: 'no-es-la-correcta',
    }).expect(401);

    expect(res.body.message).toBe('Invalid email or password');
    // The provider's own wording stays behind. It reads as one answer for two
    // different failures, and forwarding it would hand whoever is probing this
    // route a way to tell a registered address from an unregistered one.
    expect(JSON.stringify(res.body)).not.toContain('Invalid login credentials');
    expect(gotrue.calls).toHaveLength(1);
  });

  test('a GoTrue 500 becomes 500 and its message does not reach the client', async () => {
    gotrue.reset();
    // A message shaped like the ones a provider really produces when its own
    // database is unreachable: a connection string, a role name, a server hint.
    gotrue.refuseWith(500, {
      code: 500,
      msg: 'FATAL: password authentication failed for user "postgres" (SQLSTATE 28P01) at db-primary:5432',
    });

    const res = await login({
      email: CONSUMER_EMAIL,
      password: PASSWORD,
    });

    // The serialized body FIRST, before the status: this is the sharp end of
    // the case. `AuthService.login` wraps `error.message` in an
    // `InternalServerErrorException`, so the provider's text is one filter
    // rewrite away from the client, and the rewrite lives in
    // `AllExceptionsFilter` (and, for a 5xx, in Nest's own base filter). The
    // assertion is on the response as a whole rather than on one field, because
    // the leak a provider message opens is in whatever key it happened to land
    // in — and it is what fails first if somebody maps the provider's status to
    // a 4xx, which is a mutation this file does kill.
    const wire = JSON.stringify(res.body);
    expect(wire).not.toContain('postgres');
    expect(wire).not.toContain('28P01');
    expect(wire).not.toContain('db-primary');

    expect(res.status).toBe(500);
    expect(res.body.statusCode).toBe(500);
    expect(res.body.error).toBe('Internal Server Error');
    expect(res.body.message).toBe('Error interno del servidor');
  });

  test('a missing profile is repaired by the login and the answer is the seeded row', async () => {
    const orphanId = randomUUID();
    gotrue.reset();
    // No `seedProfile` for this one on purpose: `profiles` holds no row with this
    // id, which is the state ADR-0008 phase 1.5 left behind when a registration
    // created the auth user and its seeding failed. `AuthGuard` answers 401 to
    // every protected route for an account with no profile, so this is a
    // permanent lockout, and the login is where it is repaired.
    await gotrue.serveSession({
      id: orphanId,
      email: ORPHAN_EMAIL,
      userMetadata: { full_name: 'Reparada por el login' },
    });

    const res = await login({
      email: ORPHAN_EMAIL,
      password: PASSWORD,
    }).expect(200);

    expect(Object.keys(res.body.user).sort()).toEqual([
      'avatar_url',
      'email',
      'full_name',
      'id',
      'role',
    ]);
    expect(res.body.user.id).toBe(orphanId);
    expect(res.body.user.email).toBe(ORPHAN_EMAIL);
    // This is the assertion that tells the two branches apart. The fallback arm
    // of `AuthService.login` — the one that assembles a user out of GoTrue when
    // the row is still missing afterwards — answers `full_name: null` and
    // `role: 'user'`, and it is the same five keys. A name read back out of
    // `raw_user_meta_data` can only have come from the row the repair wrote, so
    // the admin is rendering the database's account and not a stand-in.
    expect(res.body.user.full_name).toBe('Reparada por el login');
    expect(res.body.user.role).toBe('user');
    expect(res.body.user.avatar_url).toBeNull();
    // The fallback's whole purpose is that the session still works: the token
    // this very response carried is what the repair just made usable.
    expect(AuthResponseSchema.safeParse(res.body).success).toBe(true);
    const me = await api()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${res.body.access_token}`)
      .expect(200);
    expect(me.body.user).toEqual({
      id: orphanId,
      email: ORPHAN_EMAIL,
      role: 'user',
    });
  });

  test('a profile with role admin comes back with that role, and its token reaches the panel', async () => {
    gotrue.reset();
    await gotrue.serveSession({ id: adminId, email: ADMIN_EMAIL });

    const res = await login({
      email: ADMIN_EMAIL,
      password: PASSWORD,
    }).expect(200);

    // `AuthResponseSchema` types `role` as the union and the admin decides which
    // panel to render from this field, so a login that dropped or defaulted it
    // would put an operator on the empty consumer view with no error anywhere.
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user.full_name).toBe('Panel');

    // And the role is not decoration in a response body: the SAME token crosses
    // the real `AuthGuard` and `RolesGuard` on a route only an admin may read.
    // `AuthGuard` reads the role out of `profiles`, not out of the claim, so this
    // also pins that the role the API reported is the role the API enforces.
    const payouts = await api()
      .get('/api/v1/payouts')
      .set('Authorization', `Bearer ${res.body.access_token}`)
      .expect(200);
    expect(Array.isArray(payouts.body.data)).toBe(true);
  });
});
