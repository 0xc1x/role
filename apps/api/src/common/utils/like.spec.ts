import { escapeLike } from './like';

describe('escapeLike', () => {
  it('deja el texto plano intacto', () => {
    expect(escapeLike('panadería la espiga')).toBe('panadería la espiga');
  });

  it('escapa %, _ y \\', () => {
    expect(escapeLike('100%_seguro\\ya')).toBe('100\\%\\_seguro\\\\ya');
  });

  it('cadena vacía queda vacía', () => {
    expect(escapeLike('')).toBe('');
  });
});
