import { pickDefined } from './pick';

describe('pickDefined', () => {
  it('picks only defined keys', () => {
    const dto = { a: 'x', b: undefined, c: 0, d: null } as Record<string, unknown>;
    expect(pickDefined(dto, ['a', 'b', 'c', 'd'] as never)).toEqual({ a: 'x', c: 0, d: null });
  });

  it('returns empty when all undefined', () => {
    expect(pickDefined({ a: undefined, b: undefined } as Record<string, unknown>, ['a', 'b'] as never)).toEqual({});
  });

  it('ignores missing keys', () => {
    expect(pickDefined({ a: 1 } as Record<string, unknown>, ['a', 'b'] as never)).toEqual({ a: 1 });
  });
});
