import { describe, expect, it } from 'bun:test';
import { CreateTipSchema } from '../schemas/tip.schema';

describe('CreateTipSchema', () => {
  it('accepts valid tip', () => {
    expect(
      CreateTipSchema.safeParse({
        content: 'Reserva antes de que se agote',
      }).success,
    ).toBe(true);
  });

  it('rejects short content', () => {
    expect(
      CreateTipSchema.safeParse({
        content: 'ab',
      }).success,
    ).toBe(false);
  });
});
