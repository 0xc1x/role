import { describe, expect, test } from 'bun:test';
import type { ExecutionContext } from '@nestjs/common';
import { CurrentUser, currentUserFactory } from './current-user.decorator';

const ctxWith = (user: unknown) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('currentUserFactory', () => {
  test('extrae user del request', () => {
    const user = { id: 'u1', role: 'admin' };
    expect(currentUserFactory(null, ctxWith(user))).toBe(user);
  });

  test('CurrentUser es un decorador válido', () => {
    expect(typeof CurrentUser).toBe('function');
  });
});
