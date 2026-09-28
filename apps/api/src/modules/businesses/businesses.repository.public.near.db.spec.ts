import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedLocation,
  seedOffer,
  seedProfile,
} from '../../../test/seed';
import { offers } from '../../database/schema';
import { BusinessesRepository } from './businesses.repository';
import type { ListPublicBusinessesQuery } from '@0xc1x/role-commons';

let ctx: TestDbContext;
let repo: BusinessesRepository;

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new BusinessesRepository(ctx.db);
});

afterAll(async () => {
  await ctx.stop();
});

const HOUR = 3_600_000;

/**
 * The searched point, and displacements whose geodesic distance from it was
 * MEASURED on this PostGIS database — the same origin, the same spots and the
 * same numbers as the geo block in `offers.repository.spec.ts`:
 *
 *   origin  0.00 km
 *   midE    0.074 km   0.0008 deg EAST, same latitude
 *   nearN   1.109 km   0.01   deg NORTH, same longitude
 *   farN   55.454 km   0.50   deg NORTH, same longitude
 *
 * `nearN` and `farN` are the pair that pins `st_makepoint(lng, lat)`: at this
 * latitude a degree of longitude is only ~0.84 of a degree of latitude, so a
 * swapped pair could not produce both of those numbers.
 *
 * `midE` exists for one reason: it is the closest location to ORIGIN other than
 * ORIGIN itself, and "the two distances" below needs a business whose nearest
 * location sits just barely outside a tight radius.
 */
const ORIGIN = { lat: -33.45, lng: -70.66 };
const SPOTS = {
  origin: { latitude: '-33.45', longitude: '-70.66' },
  midE: { latitude: '-33.45', longitude: '-70.6592' },
  nearN: { latitude: '-33.44', longitude: '-70.66' },
  farN: { latitude: '-32.95', longitude: '-70.66' },
} as const;
type Spot = keyof typeof SPOTS;

const MEASURED = {
  origin: 0,
  midE: 0.074381,
  nearN: 1.109124,
  farN: 55.454012,
} as const;

/**
 * Tolerance for a geodesic assertion: 10 m, i.e. ~1% of the shortest
 * non-trivial distance asserted here.
 *
 * A `geography` distance is a computed result, so exact float equality is a test
 * that fails when PostGIS changes its solver and passes when the coordinate order
 * is swapped — exactly backwards. 10 m is ~9 orders of magnitude above the
 * run-to-run noise of a fixed algorithm and ~4 above what a GEOS/GeographicLib
 * revision could plausibly move, while staying far too tight to survive any
 * mistake this projection is exposed to: metres instead of km (1.109 vs 0.001109),
 * `st_makepoint(lat, lng)` swapped (1.109 vs 0.930), a dropped `/ 1000.0`.
 */
const KM_TOLERANCE = 0.01;

/**
 * A search prefix unique to one fixture.
 *
 * These tests share one database, and `search` is a substring match over
 * `businesses.name` with no scoping of its own. Two fixtures that both seeded a
 * "many deals" business would make the second one see the first one's rows, and
 * the ordering assertion would fail for a reason that has nothing to do with the
 * ordering. Every fixture therefore gets its own prefix and asserts against that.
 */
let seq = 0;
const prefix = () => `Z${(seq++).toString(36)}q`;

async function list(
  query: Partial<ListPublicBusinessesQuery> = {},
): Promise<Awaited<ReturnType<typeof repo.listPublic>>> {
  return repo.listPublic({ page: 1, limit: 50, ...query });
}

describe('BusinessesRepository.listPublic — which businesses are in the list', () => {
  test('a business with a live offer is listed, one without is ABSENT', async () => {
    const p = prefix();
    const owner = await seedProfile(ctx.db);
    const withOffer = await seedBusiness(ctx.db, owner, { name: `${p} con` });
    const loc = await seedLocation(ctx.db, withOffer.id, { ...SPOTS.origin });
    await seedOffer(ctx.db, withOffer.id, loc.id);

    // No offer at all. The `matching_offers` inner join means this business is
    // not "listed with a count of 0" — it is not listed. The inner join is the
    // difference between this being a business list built from live offers and
    // being a business directory.
    const withoutOffer = await seedBusiness(ctx.db, owner, {
      name: `${p} sin`,
    });
    await seedLocation(ctx.db, withoutOffer.id, { ...SPOTS.origin });

    const hit = await repo.listPublic({
      page: 1,
      limit: 20,
      search: `${p} con`,
    });
    expect(hit.items.map((b) => b.id)).toEqual([withOffer.id]);
    expect(hit.total).toBe(1);

    const miss = await repo.listPublic({
      page: 1,
      limit: 20,
      search: `${p} sin`,
    });
    expect(miss.items).toEqual([]);
    expect(miss.total).toBe(0);
  });

  test('an expired, sold-out or deactivated offer makes the business VANISH', async () => {
    // One business per failure mode, so failing any ONE of the three predicates
    // is visible and cannot be masked by the other two passing.
    const p = prefix();
    const owner = await seedProfile(ctx.db);

    const expired = await seedBusiness(ctx.db, owner, {
      name: `${p} expirada`,
    });
    const expiredLoc = await seedLocation(ctx.db, expired.id, {
      ...SPOTS.origin,
    });
    await seedOffer(ctx.db, expired.id, expiredLoc.id, {
      pickup_end: new Date(Date.now() - HOUR),
    });

    const soldOut = await seedBusiness(ctx.db, owner, { name: `${p} agotada` });
    const soldOutLoc = await seedLocation(ctx.db, soldOut.id, {
      ...SPOTS.origin,
    });
    await seedOffer(ctx.db, soldOut.id, soldOutLoc.id, { stock: 0 });

    const deactivated = await seedBusiness(ctx.db, owner, {
      name: `${p} desactivada`,
    });
    const offLoc = await seedLocation(ctx.db, deactivated.id, {
      ...SPOTS.origin,
    });
    await seedOffer(ctx.db, deactivated.id, offLoc.id, { is_active: false });

    // A control with a genuinely live offer at the same location, so three empty
    // results cannot be explained by the seed itself failing.
    const live = await seedBusiness(ctx.db, owner, { name: `${p} vigente` });
    const liveLoc = await seedLocation(ctx.db, live.id, { ...SPOTS.origin });
    await seedOffer(ctx.db, live.id, liveLoc.id);

    for (const suffix of ['expirada', 'agotada', 'desactivada']) {
      const gone = await repo.listPublic({
        page: 1,
        limit: 20,
        search: `${p} ${suffix}`,
      });
      expect(gone.items).toEqual([]);
      expect(gone.total).toBe(0);
    }

    const alive = await repo.listPublic({
      page: 1,
      limit: 20,
      search: `${p} vigente`,
    });
    expect(alive.items.map((b) => b.id)).toEqual([live.id]);
  });

  test('the moderation gate holds, and the RPC has no gate to fall back on', async () => {
    const p = prefix();
    const owner = await seedProfile(ctx.db);

    // Each of these is approved-shaped in every other respect: active, one live
    // offer, a location at the search point with a zone. They are exactly the
    // rows that reach the API ungated if `publiclyVisibleBusiness()` is ever
    // dropped from this query — and a pending business on the map is a business
    // nobody has approved yet, publishing its address and coordinates.
    const cases = [
      {
        name: 'revision',
        overrides: { verification_status: 'pending' as const },
      },
      {
        name: 'rechazado',
        overrides: { verification_status: 'rejected' as const },
      },
      { name: 'desactivado', overrides: { is_active: false } },
    ];

    for (const { name, overrides } of cases) {
      const business = await seedBusiness(ctx.db, owner, {
        ...overrides,
        name: `${p} ${name}`,
      });
      const loc = await seedLocation(ctx.db, business.id, {
        ...SPOTS.origin,
        zone: 'Centro',
      });
      await seedOffer(ctx.db, business.id, loc.id);
    }

    const approved = await seedBusiness(ctx.db, owner, {
      name: `${p} aprobado`,
    });
    const approvedLoc = await seedLocation(ctx.db, approved.id, {
      ...SPOTS.origin,
      zone: 'Centro',
    });
    await seedOffer(ctx.db, approved.id, approvedLoc.id);

    // Every gated one, individually.
    for (const { name } of cases) {
      const gated = await repo.listPublic({
        page: 1,
        limit: 20,
        search: `${p} ${name}`,
      });
      expect(gated.items).toEqual([]);
      expect(gated.total).toBe(0);
    }

    // And the whole prefix in ONE unfiltered geo query, which is the shape a
    // real Explore-map request has. If the gate were missing this would return
    // four rows instead of one.
    const byGeo = await list({ ...ORIGIN, radius_km: 0.1, search: p });
    expect(byGeo.items.map((b) => b.id)).toEqual([approved.id]);
  });

  test('search matches the business name and type matches it case-insensitively', async () => {
    const p = prefix();
    const owner = await seedProfile(ctx.db);
    const bakery = await seedBusiness(ctx.db, owner, {
      name: `${p} Panadería Sur`,
      type: 'bakery',
    });
    const bakeryLoc = await seedLocation(ctx.db, bakery.id, {
      ...SPOTS.origin,
    });
    await seedOffer(ctx.db, bakery.id, bakeryLoc.id);

    // A second approved business with a live offer, so `type` and `search` have
    // something to EXCLUDE and a filter that silently did nothing would fail.
    const cafe = await seedBusiness(ctx.db, owner, {
      name: `${p} Ferretería Norte`,
      type: 'cafe',
    });
    const cafeLoc = await seedLocation(ctx.db, cafe.id, { ...SPOTS.farN });
    await seedOffer(ctx.db, cafe.id, cafeLoc.id);

    // `ilike`: case-insensitive substring over `b.name` only.
    for (const term of ['Panadería', 'panadería', 'adería Sur', 'Panader']) {
      const hit = await repo.listPublic({ page: 1, limit: 20, search: term });
      expect(hit.items.map((b) => b.id)).toEqual([bakery.id]);
    }
    expect(
      (await repo.listPublic({ page: 1, limit: 20, search: 'zzzz' })).items,
    ).toEqual([]);

    // `b.type::text = lower(p_type)`: the PARAMETER is lowercased, so `Bakery`
    // matches `bakery`. Typing the contract as the enum would 400 on exactly the
    // input the SQL accepts.
    for (const type of ['bakery', 'Bakery', 'BAKERY', 'BaKeRy']) {
      const hit = await repo.listPublic({ page: 1, limit: 20, type });
      expect(hit.items.map((b) => b.id)).toEqual([bakery.id]);
    }
    expect(
      (await repo.listPublic({ page: 1, limit: 20, type: 'CAFE' })).items.map(
        (b) => b.id,
      ),
    ).toEqual([cafe.id]);

    // An unknown type matches nothing rather than erroring: the SQL compares
    // text against an enum's label, it does not cast the parameter.
    expect(
      (await repo.listPublic({ page: 1, limit: 20, type: 'eatery' })).items,
    ).toEqual([]);

    // `type` and `search` compose as two predicates, not as alternatives.
    const both = await repo.listPublic({
      page: 1,
      limit: 20,
      type: 'bakery',
      search: 'Norte',
    });
    expect(both.items).toEqual([]);
  });
});

describe('BusinessesRepository.listPublic — ordering', () => {
  /**
   * Three businesses, one name each, all at the SAME distance from ORIGIN, so
   * `sort=distance` cannot break a tie and every difference between the two
   * orderings is attributable to the deal count.
   */
  async function dealsFixture(p: string) {
    const owner = await seedProfile(ctx.db);
    const make = async (name: string, count: number) => {
      const business = await seedBusiness(ctx.db, owner, {
        name: `${p} ${name}`,
      });
      const loc = await seedLocation(ctx.db, business.id, { ...SPOTS.origin });
      for (let i = 0; i < count; i++) {
        await seedOffer(ctx.db, business.id, loc.id);
      }
      return business.id;
    };
    return {
      many: await make('many', 3),
      two: await make('two', 2),
      one: await make('one', 1),
    };
  }

  test('sort=deals ranks by active_deals_count', async () => {
    const p = prefix();
    const { many, two, one } = await dealsFixture(p);

    const { items } = await repo.listPublic({
      page: 1,
      limit: 20,
      search: p,
      sort: 'deals',
    });
    expect(items.map((b) => b.id)).toEqual([many, two, one]);
    expect(items.map((b) => Number(b.active_deals_count))).toEqual([3, 2, 1]);
  });

  test('the b.name tiebreaker resolves an equal deal count', async () => {
    const p = prefix();
    const owner = await seedProfile(ctx.db);

    // One offer each, so the deal count ties. Inserted Zulu-first, so a
    // `created_at desc` ordering — what this route used to do — would return
    // [Zulu, Alfa] (Zulu is older) while the RPC's `b.name asc` returns
    // [Alfa, Zulu]. The names are what make the two orderings distinguishable.
    const zulu = await seedBusiness(ctx.db, owner, { name: `${p} Zulu` });
    const zuluLoc = await seedLocation(ctx.db, zulu.id, { ...SPOTS.origin });
    await seedOffer(ctx.db, zulu.id, zuluLoc.id);

    const alfa = await seedBusiness(ctx.db, owner, { name: `${p} Alfa` });
    const alfaLoc = await seedLocation(ctx.db, alfa.id, { ...SPOTS.origin });
    await seedOffer(ctx.db, alfa.id, alfaLoc.id);

    const { items } = await repo.listPublic({
      page: 1,
      limit: 20,
      search: p,
      sort: 'deals',
    });
    expect(items.map((b) => b.name)).toEqual([`${p} Alfa`, `${p} Zulu`]);
    expect(items.map((b) => Number(b.active_deals_count))).toEqual([1, 1]);
  });

  test('sort=distance ranks by the real distance and the ranking follows the POINT', async () => {
    const p = prefix();
    const owner = await seedProfile(ctx.db);

    // One business per spot, ONE offer each, at three different distances. The
    // names are in the OPPOSITE order to the distances (`far`, `near`, `mid` vs
    // mid → near → far), so an ordering that ignored the distance and fell
    // through to `b.name asc` would return the reverse of what is asserted.
    const make = async (name: string, spot: Spot) => {
      const business = await seedBusiness(ctx.db, owner, {
        name: `${p} ${name}`,
      });
      const loc = await seedLocation(ctx.db, business.id, { ...SPOTS[spot] });
      await seedOffer(ctx.db, business.id, loc.id);
      return business.id;
    };
    const nearId = await make('near', 'nearN');
    const midId = await make('mid', 'midE');
    const farId = await make('far', 'farN');

    // From ORIGIN the geodesic order is `midE` (0.074 km), `nearN` (1.109 km),
    // `farN` (55.454 km). `midE` beats `nearN` because it is a tenth of the
    // distance, not because of anything about the names.
    const fromOrigin = await list({ ...ORIGIN, search: p, sort: 'distance' });
    expect(fromOrigin.items.map((b) => b.id)).toEqual([midId, nearId, farId]);
    expect(fromOrigin.items.map((b) => b.name)).toEqual([
      `${p} mid`,
      `${p} near`,
      `${p} far`,
    ]);
    for (const [row, expected] of [
      [fromOrigin.items[0]!, MEASURED.midE],
      [fromOrigin.items[1]!, MEASURED.nearN],
      [fromOrigin.items[2]!, MEASURED.farN],
    ] as const) {
      expect(Math.abs((row.distance_km ?? -1) - expected)).toBeLessThan(
        KM_TOLERANCE,
      );
    }
    // Strictly increasing, so the ranking is the distance and not a coincidence.
    const distances = fromOrigin.items.map((b) => b.distance_km ?? -1);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    expect(new Set(distances).size).toBe(3);

    // The order follows the POINT, not the ids and not the names: searching from
    // the far location's own coordinates moves that business to 0 km and reverses
    // the other two, because `nearN` is 54.3 km from `farN` while `midE` is
    // 55.5 km. No ordering of the random uuids and no name ordering produces this.
    const fromFar = await list({
      lat: Number(SPOTS.farN.latitude),
      lng: Number(SPOTS.farN.longitude),
      search: p,
      sort: 'distance',
    });
    expect(fromFar.items.map((b) => b.id)).toEqual([farId, nearId, midId]);
    expect(fromFar.items[0]?.distance_km).toBe(0);
    // The two rank-swapped rows really did swap: `mid` and `near` are the first
    // two here and the last two above.
    expect(fromFar.items.map((b) => b.name)).toEqual([
      `${p} far`,
      `${p} near`,
      `${p} mid`,
    ]);
  });

  test('sort=distance with no search point leaves the key inert', async () => {
    const p = prefix();
    const { many, two, one } = await dealsFixture(p);

    // `min_distance_km` is null without a point, so the `CASE` yields null and
    // `NULLS LAST` pushes the key out of the way. What remains is the RPC's
    // documented fallback: `deals_total desc, b.name asc`. The deal counts here
    // (3, 2, 1) make that fallback the only ordering that can produce the list
    // below — a `distance` key that still sorted by distance would need a point,
    // and a key that sorted by 0 would tie and fall to `name asc`, which
    // disagrees with this order.
    const inert = await repo.listPublic({
      page: 1,
      limit: 20,
      search: p,
      sort: 'distance',
    });
    expect(inert.items.every((b) => b.distance_km === null)).toBe(true);
    expect(inert.items.map((b) => b.id)).toEqual([many, two, one]);

    // Same three rows under `deals`: the inert key is identical to the fallback.
    const byDeals = await repo.listPublic({
      page: 1,
      limit: 20,
      search: p,
      sort: 'deals',
    });
    expect(inert.items.map((b) => b.id)).toEqual(
      byDeals.items.map((b) => b.id),
    );
  });

  test('an omitted sort defaults to deals and pagination walks one stable order', async () => {
    const p = prefix();
    const { many, two, one } = await dealsFixture(p);
    const expected = [many, two, one];

    // `ListPublicBusinessesQuerySchema` defaults `sort` to `deals`, so a call
    // that never mentions the parameter is the same query.
    expect(
      (await repo.listPublic({ page: 1, limit: 20, search: p })).items.map(
        (b) => b.id,
      ),
    ).toEqual(expected);

    // The order is stable across pages, which `deals_total desc, b.name asc`
    // guarantees for three businesses with three distinct names and three
    // distinct counts. A page that repeated or dropped a row is the classic
    // symptom of an order with no final tiebreaker.
    const first = await repo.listPublic({ page: 1, limit: 2, search: p });
    const second = await repo.listPublic({ page: 2, limit: 2, search: p });
    expect([...first.items, ...second.items].map((b) => b.id)).toEqual(
      expected,
    );
    expect(second.total).toBe(3);
  });
});

/**
 * THE TWO DISTANCES, measured.
 *
 * `listPublic` computes the value it SORTS on and the value it RETURNS from two
 * different subqueries over two different sets of offers: the ordering key is
 * `min(...)` over the offers that passed the RADIUS filter, and the returned
 * `distance_km` is the distance to the location a LATERAL picked from ALL of the
 * business's live offers. It is tempting to conclude that the returned location
 * can sit outside the radius while the ordering value sits inside it.
 *
 * It cannot, and this block is the measurement rather than the argument:
 *
 *   - S = the live offers inside the radius. The business appears at all only if
 *     S is non-empty, so `min(S) <= radius`.
 *   - D = the minimum over ALL live offers. `D <= min(S) <= radius`, so the
 *     offer achieving D is inside the radius, therefore in S, therefore
 *     `D = min(S)`, and the LATERAL picks the same location the aggregate
 *     measured.
 *
 * So the two numbers are equal for every row the query can return, and the
 * scenario that would break them — a radius excluding the nearest-by-LATERAL
 * location — is unreachable: excluding the nearest excludes every location, S
 * empties, and the inner join drops the business. The second test below asserts
 * exactly that absence at a radius just under the nearest location, which is the
 * closest reachable state to the claim.
 *
 * This block exists because the SHAPE invites a "fix". The fix would be to make
 * the LATERAL respect the radius — harmless today, and wrong the day the radius
 * stops being a distance bound.
 */
describe('BusinessesRepository.listPublic — the two distances', () => {
  /**
   * One offer per spot EXCEPT `origin`.
   *
   * Excluding `origin` is the point, not an oversight: a location sitting exactly
   * on the search point is 0 km away, so it would always win the LATERAL and
   * leave the nearest distance at zero. These two tests need the nearest location
   * to be a small NON-ZERO distance so they can step a radius just under it.
   */
  const RADIAL_SPOTS = [
    'midE',
    'nearN',
    'farN',
  ] as const satisfies readonly Spot[];

  async function distanceFixture(p: string) {
    const owner = await seedProfile(ctx.db);
    const business = await seedBusiness(ctx.db, owner, { name: `${p} radios` });
    const locationIds = {} as Record<(typeof RADIAL_SPOTS)[number], string>;
    for (const spot of RADIAL_SPOTS) {
      locationIds[spot] = (
        await seedLocation(ctx.db, business.id, { name: spot, ...SPOTS[spot] })
      ).id;
      await seedOffer(ctx.db, business.id, locationIds[spot]);
    }
    return { businessId: business.id, locationIds };
  }

  test('at every radius where the business appears, the returned distance is the nearest', async () => {
    const p = prefix();
    const { locationIds } = await distanceFixture(p);

    for (const radius_km of [0.1, 0.2, 1, 2, 10, 100]) {
      const { items } = await list({
        search: p,
        ...ORIGIN,
        radius_km,
        sort: 'distance',
      });
      expect(items).toHaveLength(1);
      const row = items[0]!;
      // `midE` (0.074 km) is the nearest location to ORIGIN and it is inside
      // every one of these radii, so it is both the LATERAL's pick and the
      // aggregate's minimum.
      expect(row.business_location_id).toBe(locationIds.midE);
      expect(Math.abs((row.distance_km ?? -1) - MEASURED.midE)).toBeLessThan(
        KM_TOLERANCE,
      );
    }

    // Widening the circle changes how many offers COUNT, never which location is
    // named. `active_deals_count` is the RPC's count over the FILTERED set, so it
    // grows 1 → 2 → 3 as the circle reaches `midE`, `nearN` and `farN` — a
    // second, independent witness that the radius lands in the aggregate and not
    // in the projection.
    const counts = await Promise.all(
      [0.1, 2, 100].map(
        async (radius_km) =>
          (await list({ search: p, ...ORIGIN, radius_km })).items[0]
            ?.active_deals_count,
      ),
    );
    expect(counts).toEqual(['1', '2', '3']);

    const wide = await list({ search: p, ...ORIGIN, radius_km: 100 });
    expect(wide.items[0]?.business_location_id).toBe(locationIds.midE);
  });

  test('a radius that excludes the nearest location drops the business entirely', async () => {
    const p = prefix();
    const { locationIds } = await distanceFixture(p);

    // Take the distance the database itself reports for the nearest location and
    // step just under it.
    const nearest = (await list({ search: p, ...ORIGIN })).items[0]!
      .distance_km!;
    expect(nearest).toBeGreaterThan(0);
    expect(Math.abs(nearest - MEASURED.midE)).toBeLessThan(KM_TOLERANCE);

    // Just under the boundary: the whole group is filtered away, and the inner
    // join means the business is not in the result AT ALL — not present with an
    // empty offer set, not present with a distance outside the radius.
    const refused = await list({
      search: p,
      ...ORIGIN,
      radius_km: nearest * (1 - 1e-3),
      sort: 'distance',
    });
    expect(refused.items).toEqual([]);
    expect(refused.total).toBe(0);

    // Just over it: present, and the returned location is the one inside the
    // radius. There is no reachable state in which the ordering value is inside
    // the radius and the returned location is outside it; this is as close as the
    // fixture gets, and it is why the "fix" this shape invites would be a no-op
    // on today's data.
    const admitted = await list({
      search: p,
      ...ORIGIN,
      radius_km: nearest * (1 + 1e-3),
      sort: 'distance',
    });
    expect(admitted.items).toHaveLength(1);
    expect(admitted.items[0]?.business_location_id).toBe(locationIds.midE);
    expect(
      Math.abs((admitted.items[0]?.distance_km ?? -1) - MEASURED.midE),
    ).toBeLessThan(KM_TOLERANCE);
  });

  test('the radius boundary is inclusive, within the tolerance PostGIS allows', async () => {
    // `ST_DWithin` and `ST_Distance` do not agree bit-for-bit: `ST_DWithin`
    // short-circuits on a bounding box and its internal distance differs from
    // `ST_Distance`'s by ~1e-8 m, so on this database
    // `st_dwithin(geog, p, st_distance(geog, p))` is FALSE. "Exactly on the
    // boundary" is therefore only buildable as "at the distance the database
    // computed", nudged by a RELATIVE epsilon: 1e-6 is 55 mm at 55 km and 1.1 mm
    // at 1.1 km — five orders above that noise and five below anything a radius
    // can meaningfully express. A boundary test without it flakes on a PostGIS
    // upgrade, which is the failure mode this comment exists to prevent.
    const p = prefix();
    const owner = await seedProfile(ctx.db);
    const business = await seedBusiness(ctx.db, owner, { name: `${p} borde` });
    const loc = await seedLocation(ctx.db, business.id, { ...SPOTS.farN });
    await seedOffer(ctx.db, business.id, loc.id);

    const reported = (await list({ search: p, ...ORIGIN })).items[0]!
      .distance_km!;
    expect(Math.abs(reported - MEASURED.farN)).toBeLessThan(KM_TOLERANCE);

    const admitted = await list({
      search: p,
      ...ORIGIN,
      radius_km: reported * (1 + 1e-6),
    });
    expect(admitted.items).toHaveLength(1);

    const refused = await list({
      search: p,
      ...ORIGIN,
      radius_km: reported * (1 - 1e-6),
    });
    expect(refused.items).toEqual([]);
  });

  test('a point with no radius does NOT filter', async () => {
    // The radius filter needs all THREE of `p_lat`, `p_lng`, `p_radius_km`. A
    // point that silently became a 0 km search would answer nothing at all.
    const p = prefix();
    const owner = await seedProfile(ctx.db);
    const business = await seedBusiness(ctx.db, owner, {
      name: `${p} noradio`,
    });
    const nearLoc = await seedLocation(ctx.db, business.id, { ...SPOTS.nearN });
    const farLoc = await seedLocation(ctx.db, business.id, { ...SPOTS.farN });
    await seedOffer(ctx.db, business.id, nearLoc.id);
    await seedOffer(ctx.db, business.id, farLoc.id);

    // 55 km apart, both counted: the 1.109 km one did not narrow anything.
    const { items } = await list({ search: p, ...ORIGIN });
    expect(items).toHaveLength(1);
    expect(items[0]?.active_deals_count).toBe('2');
  });

  test('half a point is not a point: no distance, and still no filter', async () => {
    // `distance_km` is null when EITHER coordinate is absent, and the distance
    // ORDER BY key is inert in that case. A half-point that produced a distance
    // would be a number nobody asked for.
    const p = prefix();
    const owner = await seedProfile(ctx.db);
    const business = await seedBusiness(ctx.db, owner, { name: `${p} medio` });
    const loc = await seedLocation(ctx.db, business.id, { ...SPOTS.nearN });
    await seedOffer(ctx.db, business.id, loc.id);

    const latOnly = await list({ lat: ORIGIN.lat, search: p });
    expect(latOnly.items).toHaveLength(1);
    expect(latOnly.items[0]?.distance_km).toBeNull();
    expect(latOnly.items[0]?.active_deals_count).toBe('1');

    // A radius with no point filters nothing, rather than everything.
    expect((await list({ radius_km: 0.1, search: p })).items).toHaveLength(1);
  });

  test('no search point: null distance, every business, location still named', async () => {
    const p = prefix();
    const owner = await seedProfile(ctx.db);
    const business = await seedBusiness(ctx.db, owner, {
      name: `${p} sinpunto`,
    });
    const loc = await seedLocation(ctx.db, business.id, {
      ...SPOTS.farN,
      zone: 'Norte',
    });
    await seedOffer(ctx.db, business.id, loc.id);

    for (const sort of ['deals', 'distance'] as const) {
      const { items } = await list({ search: p, sort });
      expect(items).toHaveLength(1);
      expect(items[0]?.distance_km).toBeNull();
      // Only the DISTANCE needs a point. The pickup point, its address and its
      // zone are properties of the business and are named either way — the
      // Explore map renders them before it has a location.
      expect(items[0]?.business_location_id).toBe(loc.id);
      expect(items[0]?.address).toBe('Calle 123');
      // `numeric(10,7)` comes back as the padded string `'-32.9500000'`; the
      // mapper turns it into a number, which is what the contract carries. The
      // repository row stays a string because that is what the column is.
      expect(Number(items[0]?.latitude)).toBe(Number(SPOTS.farN.latitude));
      expect(Number(items[0]?.longitude)).toBe(Number(SPOTS.farN.longitude));
      expect(items[0]?.zone).toBe('Norte');
    }
  });

  test('the LATERAL picks the nearest location, and l2.id breaks an exact tie', async () => {
    const p = prefix();
    const owner = await seedProfile(ctx.db);
    const business = await seedBusiness(ctx.db, owner, {
      name: `${p} lateral`,
    });

    // Two locations at the IDENTICAL coordinate, so the tie is in the geodesic
    // and not an accident of the projection. `nearN` is 1.109 km from ORIGIN and
    // `farN` is 55.454 km, so without the tiebreaker the assertion below could
    // pass by picking the far one — the distance is asserted too.
    const a = await seedLocation(ctx.db, business.id, { ...SPOTS.nearN });
    const b = await seedLocation(ctx.db, business.id, { ...SPOTS.nearN });
    await seedOffer(ctx.db, business.id, a.id);
    await seedOffer(ctx.db, business.id, b.id);

    const { items } = await list({ search: p, ...ORIGIN, sort: 'distance' });
    expect(items).toHaveLength(1);
    // Same distance from both, so `order by <distance> asc nulls last, l2.id`
    // decides and the lower uuid wins.
    const expected = [a.id, b.id].sort();
    expect(items[0]?.business_location_id).toBe(expected[0]);
    expect(
      Math.abs((items[0]?.distance_km ?? -1) - MEASURED.nearN),
    ).toBeLessThan(KM_TOLERANCE);

    // Re-reading returns the same location. Determinism is the whole reason the
    // tiebreaker is in the SQL.
    const again = await list({ search: p, ...ORIGIN, sort: 'distance' });
    expect(again.items[0]?.business_location_id).toBe(
      items[0]?.business_location_id,
    );
  });

  test('a location whose only offer sold out is not named', async () => {
    // The LATERAL re-states `is_active and stock > 0 and pickup_end > now()`
    // instead of trusting the aggregate. Not redundant: the aggregate ran a
    // moment earlier, and a pickup point with nothing on it is not somewhere to
    // send a reader.
    const p = prefix();
    const owner = await seedProfile(ctx.db);
    const business = await seedBusiness(ctx.db, owner, {
      name: `${p} agotada`,
    });
    const here = await seedLocation(ctx.db, business.id, { ...SPOTS.origin });
    const gone = await seedLocation(ctx.db, business.id, { ...SPOTS.nearN });
    await seedOffer(ctx.db, business.id, gone.id, { stock: 0 });
    await seedOffer(ctx.db, business.id, here.id);

    const { items } = await list({ search: p, ...ORIGIN });
    expect(items).toHaveLength(1);
    expect(items[0]?.business_location_id).toBe(here.id);
    expect(items[0]?.distance_km).toBe(0);
  });

  test('an offer whose pickup window closed between the two reads cannot break the query', async () => {
    // The aggregate and the LATERAL are two statements over a table that is
    // being written concurrently. An offer that expires in between must leave
    // the LATERAL with nothing to pick rather than crash it — the `limit 1` on a
    // correlated subquery can return zero rows, and the `join lateral ... on
    // true` then drops the business. That is the SQL's behaviour and it is what
    // this reproduces, deterministically, by expiring the only offer AFTER the
    // aggregate would have counted it.
    const p = prefix();
    const owner = await seedProfile(ctx.db);
    const business = await seedBusiness(ctx.db, owner, {
      name: `${p} carrera`,
    });
    const loc = await seedLocation(ctx.db, business.id, { ...SPOTS.origin });
    const offer = await seedOffer(ctx.db, business.id, loc.id);

    expect((await list({ search: p })).items).toHaveLength(1);

    await ctx.db
      .update(offers)
      .set({ pickup_end: new Date(Date.now() - HOUR) })
      .where(eq(offers.id, offer.id));

    expect((await list({ search: p })).items).toEqual([]);
  });
});
