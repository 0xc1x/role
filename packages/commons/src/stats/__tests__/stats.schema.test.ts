import { describe, expect, it } from 'vitest';
import { PlatformStatsSchema } from '../schemas/stats.schema';

describe('PlatformStatsSchema', () => {
  it('accepts stats payload', () => {
    expect(
      PlatformStatsSchema.safeParse({
        users: 1000,
        businesses: 10,
        meals_saved: 200,
      }).success,
    ).toBe(true);
  });

  it('rejects negative counts', () => {
    expect(
      PlatformStatsSchema.safeParse({
        users: -1,
        businesses: 0,
        meals_saved: 0,
      }).success,
    ).toBe(false);
  });
});
