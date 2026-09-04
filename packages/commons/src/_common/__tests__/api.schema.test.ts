import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import {
  BooleanQuerySchema,
  PaginatedDataSchema,
  PaginationMetaSchema,
  PaginationQuerySchema,
} from '../schemas/api.schema';

describe('PaginationQuerySchema', () => {
  it('defaults page and limit', () => {
    const parsed = PaginationQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
  });

  it('rejects limit above 100', () => {
    expect(PaginationQuerySchema.safeParse({ limit: 150 }).success).toBe(false);
  });
});

describe('BooleanQuerySchema', () => {
  it('coerces string true', () => {
    expect(BooleanQuerySchema.parse('true')).toBe(true);
    expect(BooleanQuerySchema.parse('1')).toBe(true);
    expect(BooleanQuerySchema.parse('false')).toBe(false);
  });
});

describe('PaginatedDataSchema', () => {
  it('validates meta shape', () => {
    const Item = z.object({ id: z.string() });
    const schema = PaginatedDataSchema(Item);
    expect(
      schema.safeParse({
        data: [{ id: '1' }],
        meta: { page: 1, limit: 10, total: 1, total_pages: 1 },
      }).success,
    ).toBe(true);
  });

  it('rejects invalid meta', () => {
    expect(
      PaginationMetaSchema.safeParse({ page: 0, limit: 10, total: 0, total_pages: 0 })
        .success,
    ).toBe(false);
  });
});

describe('Zod 4.5 features', () => {
  it('supports z.validate for fast boolean checks', () => {
    const Item = z.object({ id: z.string() });
    expect(z.validate(Item, { id: 'test' })).toBe(true);
    expect(z.validate(Item, { id: 123 })).toBe(false);
  });

  it('supports z.compile for pre-compiling schemas', () => {
    const Item = z.object({ name: z.string(), count: z.number() });
    const CompiledItem = z.compile(Item);
    const result = CompiledItem.parse({ name: 'Role', count: 10 });
    expect(result).toEqual({ name: 'Role', count: 10 });
  });

  it('supports z.creditCard with Luhn checksum validation', () => {
    const CardSchema = z.creditCard();
    expect(z.validate(CardSchema, '4111 1111 1111 1111')).toBe(true);
    expect(z.validate(CardSchema, '4111 1111 1111 1112')).toBe(false);
  });
});
