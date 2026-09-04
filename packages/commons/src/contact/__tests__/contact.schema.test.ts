import { describe, expect, it } from 'bun:test';
import { CreateContactSchema } from '../schemas/contact.schema';

describe('CreateContactSchema', () => {
  const base = {
    email: 'Test@Example.COM',
    role: 'persona' as const,
    city: 'Quito',
  };

  it('accepts valid contact and normalizes email', () => {
    const parsed = CreateContactSchema.parse(base);
    expect(parsed.email).toBe('test@example.com');
    expect(parsed.name).toBe('');
  });

  it('rejects invalid email', () => {
    expect(CreateContactSchema.safeParse({ ...base, email: 'not-email' }).success).toBe(false);
  });

  it('requires city_other when city is Otra', () => {
    const result = CreateContactSchema.safeParse({ ...base, city: 'Otra' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('city_other'))).toBe(true);
    }
  });

  it('accepts Otra with city_other', () => {
    const parsed = CreateContactSchema.parse({
      ...base,
      city: 'Otra',
      city_other: 'Ambato',
    });
    expect(parsed.city_other).toBe('Ambato');
  });
});
