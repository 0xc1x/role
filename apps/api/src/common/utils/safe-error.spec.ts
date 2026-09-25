import { safeErrorFields, safeErrorSummary } from './safe-error';

describe('safe error fields', () => {
  test('keeps bounded type and code diagnostics only', () => {
    const error = Object.assign(new Error('password=secret'), {
      name: 'PostgrestError',
      code: '23505',
    });

    expect(safeErrorFields(error)).toEqual({
      errorType: 'PostgrestError',
      errorCode: '23505',
    });
    expect(safeErrorSummary(error)).toBe('PostgrestError:23505');
    expect(JSON.stringify(safeErrorFields(error))).not.toContain('secret');
  });

  test('drops unbounded or unsafe diagnostic fields', () => {
    const error = Object.assign(new Error('token leaked'), {
      name: 'x'.repeat(200),
      code: 'code with spaces and a very long value '.repeat(10),
    });

    expect(safeErrorFields(error)).toEqual({ errorType: 'UnknownError' });
  });

  test('handles non-error values without stringifying their contents', () => {
    const secret = { token: 'do-not-log' };
    expect(safeErrorFields(secret)).toEqual({ errorType: 'object' });
    expect(JSON.stringify(safeErrorFields(secret))).not.toContain('do-not-log');
  });
});
