import { toNumber, toNumberOrNull } from './numeric';

describe('toNumber', () => {
  it('coerce numeric de Postgres (string decimal)', () => {
    expect(toNumber('19.99')).toBe(19.99);
    expect(toNumber('0.1')).toBe(0.1);
  });

  it('pasa números tal cual', () => {
    expect(toNumber(42)).toBe(42);
    expect(toNumber(0)).toBe(0);
  });

  it('null/undefined → 0', () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
  });

  it('string no numérico → 0 (numeric corrupto)', () => {
    expect(toNumber('NaN')).toBe(0);
    expect(toNumber('abc')).toBe(0);
    expect(toNumber('')).toBe(0);
  });
});

describe('toNumberOrNull', () => {
  it('preserva null/undefined como null (rating sin valor)', () => {
    expect(toNumberOrNull(null)).toBeNull();
    expect(toNumberOrNull(undefined)).toBeNull();
  });

  it('coerce valores presentes a number', () => {
    expect(toNumberOrNull('4.7')).toBe(4.7);
    expect(toNumberOrNull(3)).toBe(3);
  });
});
