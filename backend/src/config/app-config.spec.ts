import { AppConfig } from './app-config.js';

const DATABASE_URL = 'postgres://user:pass@localhost:5432/db';

describe('AppConfig', () => {
  it('throws a clear error when DATABASE_URL is missing', () => {
    expect(() => new AppConfig({})).toThrow(
      'Missing required environment variable: DATABASE_URL',
    );
  });

  it('treats an empty DATABASE_URL as missing', () => {
    expect(() => new AppConfig({ DATABASE_URL: '' })).toThrow(
      'Missing required environment variable: DATABASE_URL',
    );
  });

  it('reads DATABASE_URL and defaults the port to 3001', () => {
    const config = new AppConfig({ DATABASE_URL });

    expect(config.databaseUrl).toBe(DATABASE_URL);
    expect(config.port).toBe(3001);
  });

  it('reads PORT as a number', () => {
    const config = new AppConfig({ DATABASE_URL, PORT: '4000' });

    expect(config.port).toBe(4000);
  });

  it('throws when PORT is not a valid port number', () => {
    expect(() => new AppConfig({ DATABASE_URL, PORT: 'abc' })).toThrow(
      'Invalid environment variable PORT',
    );
  });

  it('is in production mode only when NODE_ENV is "production"', () => {
    expect(new AppConfig({ DATABASE_URL }).isProduction).toBe(false);
    expect(
      new AppConfig({ DATABASE_URL, NODE_ENV: 'development' }).isProduction,
    ).toBe(false);
    expect(
      new AppConfig({ DATABASE_URL, NODE_ENV: 'production' }).isProduction,
    ).toBe(true);
  });
});
