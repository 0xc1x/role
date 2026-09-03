import { describe, expect, it } from 'vitest';
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  RefreshRequestSchema,
} from '../schemas/auth.schema';

describe('LoginRequestSchema', () => {
  it('accepts valid credentials', () => {
    expect(
      LoginRequestSchema.safeParse({ email: 'a@b.com', password: 'secret' }).success,
    ).toBe(true);
  });

  it('rejects short password', () => {
    expect(
      LoginRequestSchema.safeParse({ email: 'a@b.com', password: '12345' }).success,
    ).toBe(false);
  });
});

describe('RegisterRequestSchema', () => {
  it('accepts valid registration', () => {
    expect(
      RegisterRequestSchema.safeParse({
        email: 'a@b.com',
        password: 'password1',
        full_name: 'Ana López',
      }).success,
    ).toBe(true);
  });

  it('rejects password shorter than 8', () => {
    expect(
      RegisterRequestSchema.safeParse({
        email: 'a@b.com',
        password: 'short',
        full_name: 'Ana',
      }).success,
    ).toBe(false);
  });
});

describe('RefreshRequestSchema', () => {
  it('requires refresh_token', () => {
    expect(RefreshRequestSchema.safeParse({}).success).toBe(false);
    expect(RefreshRequestSchema.safeParse({ refresh_token: 'tok' }).success).toBe(true);
  });
});
