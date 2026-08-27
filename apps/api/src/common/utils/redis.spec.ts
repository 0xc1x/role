import { parseRedisUrl } from './redis';

describe('parseRedisUrl', () => {
  it('defaults to localhost when empty', () => {
    expect(parseRedisUrl('')).toMatchObject({ host: 'localhost', port: 6379 });
  });

  it('parses redis:// url with auth', () => {
    const opts = parseRedisUrl('redis://user:pass@myhost:6380');
    expect(opts).toMatchObject({ host: 'myhost', port: 6380, username: 'user', password: 'pass' });
  });

  it('defaults port to 6379 when missing', () => {
    const opts = parseRedisUrl('redis://myhost');
    expect(opts).toMatchObject({ host: 'myhost', port: 6379 });
  });

  it('falls back to localhost on invalid url', () => {
    expect(parseRedisUrl('not a url')).toMatchObject({ host: 'localhost', port: 6379 });
  });

  it('sets maxRetriesPerRequest to null', () => {
    expect(parseRedisUrl('redis://host:6379').maxRetriesPerRequest).toBeNull();
  });
});
