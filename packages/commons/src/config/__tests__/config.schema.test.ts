import { describe, expect, it } from 'vitest';
import {
  AppConfigKeySchema,
  CreateAppConfigSchema,
  UpdateAppConfigSchema,
  ListAppConfigQuerySchema,
} from '../schemas/config.schema';
import { coerceConfigValue, getConfigValue } from '../helpers/config-value';

describe('AppConfigKeySchema', () => {
  it('accepts valid dot-separated snake_case', () => {
    expect(AppConfigKeySchema.safeParse('fees.vat_percent').success).toBe(true);
    expect(AppConfigKeySchema.safeParse('support.email').success).toBe(true);
    expect(AppConfigKeySchema.safeParse('a').success).toBe(true);
  });

  it('rejects invalid keys', () => {
    expect(AppConfigKeySchema.safeParse('').success).toBe(false);
    expect(AppConfigKeySchema.safeParse('Fees.vat').success).toBe(false);
    expect(AppConfigKeySchema.safeParse('fees..vat').success).toBe(false);
    expect(AppConfigKeySchema.safeParse('fees.VAT').success).toBe(false);
    expect(AppConfigKeySchema.safeParse('a'.repeat(101)).success).toBe(false);
  });
});

describe('CreateAppConfigSchema defaults', () => {
  it('fills defaults', () => {
    const parsed = CreateAppConfigSchema.parse({
      key: 'test.key',
      value: 'hello',
      label: 'Test',
    });
    expect(parsed.value_type).toBe('string');
    expect(parsed.category).toBe('general');
    expect(parsed.is_public).toBe(true);
    expect(parsed.active).toBe(true);
    expect(parsed.description).toBeNull();
  });
});

describe('UpdateAppConfigSchema', () => {
  it('rejects empty body', () => {
    expect(UpdateAppConfigSchema.safeParse({}).success).toBe(false);
  });

  it('accepts single field', () => {
    expect(UpdateAppConfigSchema.safeParse({ value: 'x' }).success).toBe(true);
  });
});

describe('ListAppConfigQuerySchema', () => {
  it('defaults page/limit', () => {
    const parsed = ListAppConfigQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
  });

  it('coerces active query string', () => {
    expect(ListAppConfigQuerySchema.parse({ active: 'true' }).active).toBe(true);
    expect(ListAppConfigQuerySchema.parse({ active: '0' }).active).toBe(false);
  });
});

describe('coerceConfigValue', () => {
  it('returns raw when type matches', () => {
    expect(coerceConfigValue(42, 'number', 0)).toBe(42);
    expect(coerceConfigValue(true, 'boolean', false)).toBe(true);
    expect(coerceConfigValue('hi', 'string', '')).toBe('hi');
  });

  it('returns fallback when type mismatches', () => {
    expect(coerceConfigValue('not-a-number', 'number', 99)).toBe(99);
    expect(coerceConfigValue(123, 'string', 'fallback')).toBe('fallback');
    expect(coerceConfigValue('true', 'boolean', false)).toBe(false);
  });
});

describe('getConfigValue', () => {
  it('returns fallback for missing key', () => {
    expect(getConfigValue(undefined, 'x', 'fb')).toBe('fb');
    expect(getConfigValue({}, 'x', 5)).toBe(5);
  });

  it('returns value when type matches fallback', () => {
    expect(getConfigValue({ k: 'hello' }, 'k', 'fb')).toBe('hello');
    expect(getConfigValue({ k: 123 }, 'k', 0)).toBe(123);
    expect(getConfigValue({ k: true }, 'k', false)).toBe(true);
  });

  it('returns fallback when type mismatches', () => {
    expect(getConfigValue({ k: 123 }, 'k', 'fb')).toBe('fb');
    expect(getConfigValue({ k: 'str' }, 'k', 0)).toBe(0);
  });

  it('returns fallback for null value', () => {
    expect(getConfigValue({ k: null } as never, 'k', 'fb')).toBe('fb');
  });
});
