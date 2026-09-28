import { describe, expect, it } from 'bun:test';
import { MeMapper } from './me.mapper';
import type {
  MarketingPreferencesRow,
  UserOrderStatsRow,
} from './me.repository';

const now = new Date('2026-09-01T12:00:00.000Z');

const makeMarketingRow = (
  overrides: Partial<MarketingPreferencesRow> = {},
): MarketingPreferencesRow =>
  ({
    user_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    is_subscribed: true,
    categories: ['announcements'],
    unsubscribed_at: null,
    source: 'app',
    updated_at: now,
    ...overrides,
  }) as MarketingPreferencesRow;

describe('MeMapper.toMarketingPreferencesDto', () => {
  it('crosses every timestamp as an ISO string', () => {
    const dto = MeMapper.toMarketingPreferencesDto(
      makeMarketingRow({
        unsubscribed_at: new Date('2026-08-01T09:30:00.000Z'),
      }),
    );

    expect(dto.unsubscribed_at).toBe('2026-08-01T09:30:00.000Z');
    expect(dto.updated_at).toBe('2026-09-01T12:00:00.000Z');
  });

  it('keeps a null unsubscribe as null, not as an epoch', () => {
    expect(
      MeMapper.toMarketingPreferencesDto(makeMarketingRow()).unsubscribed_at,
    ).toBeNull();
  });

  it('passes the source through: it is provenance, and the caller cannot write it', () => {
    for (const source of ['seed', 'app', 'email_link', null]) {
      expect(
        MeMapper.toMarketingPreferencesDto(makeMarketingRow({ source })).source,
      ).toBe(source);
    }
  });

  it('drops a category outside the declared union', () => {
    // Mobile writes this table through PostgREST with no validation, so a value
    // the contract cannot name is reachable on the row. It can never match a
    // campaign — `findSubscribedRecipients` compares the array against a
    // validated `campaigns.category` — so reporting it as a held preference would
    // be showing the user a checked box that delivers nothing. The response now
    // says "these are the categories that can actually reach you", and a client
    // that PATCHes back what it read writes the same set that was already doing
    // something.
    const dto = MeMapper.toMarketingPreferencesDto(
      makeMarketingRow({
        categories: ['announcements', 'black-friday', 'news'],
      }),
    );

    expect(dto.categories).toEqual(['announcements', 'news']);
  });

  it('reports an empty list as empty, which is a real state and not null', () => {
    // A subscribed person with no categories receives no campaign. That is inert
    // and worth rendering, so it must survive the mapper rather than become a
    // null the client has to special-case.
    const dto = MeMapper.toMarketingPreferencesDto(
      makeMarketingRow({ categories: [] }),
    );

    expect(dto.categories).toEqual([]);
  });
});

describe('MeMapper.toUserOrderStatsDto', () => {
  const row = (
    overrides: Partial<UserOrderStatsRow> = {},
  ): UserOrderStatsRow => ({
    orders_count: 3,
    total_saved: '50.00',
    ...overrides,
  });

  it('rounds the numeric string the way the money report does', () => {
    expect(
      MeMapper.toUserOrderStatsDto(row({ total_saved: '61.7285' })),
    ).toEqual({
      orders_count: 3,
      total_saved: 61.73,
    });
  });

  it('reads a zero total as 0, not as NaN', () => {
    expect(
      MeMapper.toUserOrderStatsDto(row({ total_saved: '0' })).total_saved,
    ).toBe(0);
  });

  it('does not floor a negative saving', () => {
    expect(
      MeMapper.toUserOrderStatsDto(row({ total_saved: '-3.5' })).total_saved,
    ).toBe(-3.5);
  });
});
