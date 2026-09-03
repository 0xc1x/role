import { describe, expect, it } from 'vitest';
import { CreateProfileSchema } from '../schemas/profile.schema';
import { FavoriteSchema } from '../schemas/favorite.schema';

const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

describe('CreateProfileSchema', () => {
  it('accepts profile with default role', () => {
    const parsed = CreateProfileSchema.parse({
      id: uuid,
      email: 'user@example.com',
    });
    expect(parsed.email).toBe('user@example.com');
  });

  it('rejects invalid role', () => {
    expect(
      CreateProfileSchema.safeParse({
        id: uuid,
        email: 'user@example.com',
        role: 'superadmin',
      }).success,
    ).toBe(false);
  });
});

describe('FavoriteSchema', () => {
  it('accepts favorite link', () => {
    expect(
      FavoriteSchema.safeParse({
        id: uuid,
        user_id: uuid,
        offer_id: uuid,
        created_at: '2026-01-01T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});
