import { describe, expect, it } from 'bun:test';
import { CreateBusinessSchema } from '../schemas/business.schema';
import { ListBusinessesQuerySchema } from '../schemas/business-query.schema';

describe('CreateBusinessSchema', () => {
  it('accepts minimal business', () => {
    expect(
      CreateBusinessSchema.safeParse({
        name: 'Café Central',
        slug: 'cafe-central',
      }).success,
    ).toBe(true);
  });

  it('rejects invalid email', () => {
    expect(
      CreateBusinessSchema.safeParse({
        name: 'Café',
        slug: 'cafe',
        email: 'not-email',
      }).success,
    ).toBe(false);
  });
});

describe('ListBusinessesQuerySchema', () => {
  it('defaults pagination', () => {
    const parsed = ListBusinessesQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
  });
});
