import { AppConfig } from './app-config.js';

const DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
const GROQ_API_KEY = 'gsk_test';
/** The two variables without which the app refuses to start. */
const BASE = { DATABASE_URL, GROQ_API_KEY };

describe('AppConfig', () => {
  it('throws a clear error when DATABASE_URL is missing', () => {
    expect(() => new AppConfig({ GROQ_API_KEY })).toThrow(
      'Missing required environment variable: DATABASE_URL',
    );
  });

  it('treats an empty DATABASE_URL as missing', () => {
    expect(() => new AppConfig({ GROQ_API_KEY, DATABASE_URL: '' })).toThrow(
      'Missing required environment variable: DATABASE_URL',
    );
  });

  it('reads DATABASE_URL and defaults the port to 3001', () => {
    const config = new AppConfig(BASE);

    expect(config.databaseUrl).toBe(DATABASE_URL);
    expect(config.port).toBe(3001);
  });

  it('reads PORT as a number', () => {
    const config = new AppConfig({ ...BASE, PORT: '4000' });

    expect(config.port).toBe(4000);
  });

  it('throws when PORT is not a valid port number', () => {
    expect(() => new AppConfig({ ...BASE, PORT: 'abc' })).toThrow(
      'Invalid environment variable PORT',
    );
  });

  it('is in production mode only when NODE_ENV is "production"', () => {
    expect(new AppConfig(BASE).isProduction).toBe(false);
    expect(
      new AppConfig({ ...BASE, NODE_ENV: 'development' }).isProduction,
    ).toBe(false);
    expect(
      new AppConfig({ ...BASE, NODE_ENV: 'production' }).isProduction,
    ).toBe(true);
  });

  it('trusts no proxy unless TRUST_PROXY says how many', () => {
    expect(new AppConfig(BASE).trustProxy).toBe(0);
    expect(new AppConfig({ ...BASE, TRUST_PROXY: '' }).trustProxy).toBe(0);
    expect(new AppConfig({ ...BASE, TRUST_PROXY: '2' }).trustProxy).toBe(2);
  });

  it('throws when TRUST_PROXY is not a whole number of proxies', () => {
    for (const value of ['abc', '-1', '1.5', 'true']) {
      expect(() => new AppConfig({ ...BASE, TRUST_PROXY: value })).toThrow(
        'Invalid environment variable TRUST_PROXY',
      );
    }
  });

  describe('the AI advice', () => {
    it('throws a clear error when GROQ_API_KEY is missing or empty', () => {
      expect(() => new AppConfig({ DATABASE_URL })).toThrow(
        'Missing required environment variable: GROQ_API_KEY',
      );
      expect(() => new AppConfig({ DATABASE_URL, GROQ_API_KEY: '' })).toThrow(
        'Missing required environment variable: GROQ_API_KEY',
      );
    });

    it('reads GROQ_API_KEY and defaults the model, the daily limit and the timeout', () => {
      const config = new AppConfig(BASE);

      expect(config.groqApiKey).toBe(GROQ_API_KEY);
      expect(config.aiModel).toBe('openai/gpt-oss-120b');
      expect(config.aiDailyLimit).toBe(10);
      expect(config.aiTimeoutMs).toBe(20_000);
    });

    it('treats an empty AI_MODEL as the default and reads a set one', () => {
      expect(new AppConfig({ ...BASE, AI_MODEL: '' }).aiModel).toBe(
        'openai/gpt-oss-120b',
      );
      expect(
        new AppConfig({ ...BASE, AI_MODEL: 'openai/gpt-oss-20b' }).aiModel,
      ).toBe('openai/gpt-oss-20b');
    });

    it('reads AI_DAILY_LIMIT as a whole number of calls, 1 or more', () => {
      expect(new AppConfig({ ...BASE, AI_DAILY_LIMIT: '' }).aiDailyLimit).toBe(
        10,
      );
      expect(new AppConfig({ ...BASE, AI_DAILY_LIMIT: '1' }).aiDailyLimit).toBe(
        1,
      );
      expect(
        new AppConfig({ ...BASE, AI_DAILY_LIMIT: '25' }).aiDailyLimit,
      ).toBe(25);
      for (const value of ['abc', '0', '-1', '1.5', 'true']) {
        expect(() => new AppConfig({ ...BASE, AI_DAILY_LIMIT: value })).toThrow(
          'Invalid environment variable AI_DAILY_LIMIT',
        );
      }
    });

    it('reads AI_TIMEOUT_MS as whole milliseconds, 1000 or more', () => {
      expect(new AppConfig({ ...BASE, AI_TIMEOUT_MS: '' }).aiTimeoutMs).toBe(
        20_000,
      );
      expect(
        new AppConfig({ ...BASE, AI_TIMEOUT_MS: '1000' }).aiTimeoutMs,
      ).toBe(1000);
      expect(
        new AppConfig({ ...BASE, AI_TIMEOUT_MS: '45000' }).aiTimeoutMs,
      ).toBe(45_000);
      for (const value of ['abc', '999', '0', '1.5']) {
        expect(() => new AppConfig({ ...BASE, AI_TIMEOUT_MS: value })).toThrow(
          'Invalid environment variable AI_TIMEOUT_MS',
        );
      }
    });
  });
});
