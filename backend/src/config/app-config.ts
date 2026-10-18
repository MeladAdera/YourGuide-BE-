const DEFAULT_PORT = 3001;
const DEFAULT_AI_DAILY_LIMIT = 10;
const DEFAULT_AI_TIMEOUT_MS = 20_000;
const MIN_AI_TIMEOUT_MS = 1_000;

/**
 * The language-model providers the backend can talk to. One is active, chosen
 * by AI_PROVIDER; its own key variable is then required. Mistral is the
 * default: it is the one that answers from the developer's network.
 */
export const AI_PROVIDERS = ['mistral', 'groq'] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];

const API_KEY_VARIABLE: Record<AiProviderName, string> = {
  mistral: 'MISTRAL_API_KEY',
  groq: 'GROQ_API_KEY',
};

const DEFAULT_AI_MODEL: Record<AiProviderName, string> = {
  mistral: 'mistral-medium-latest',
  groq: 'openai/gpt-oss-120b',
};

/**
 * Every environment variable the API uses, read and validated once at startup.
 * Inject this class instead of reading `process.env`.
 */
export class AppConfig {
  readonly databaseUrl: string;
  readonly port: number;
  /** True when NODE_ENV is "production". Hosting platforms set it. */
  readonly isProduction: boolean;
  /**
   * How many proxies sit in front of the API (0 = none). With a proxy, the
   * connection comes from the proxy, so Express must read the real client IP
   * from X-Forwarded-For. The rate limit counts requests per client IP.
   */
  readonly trustProxy: number;
  /** Which provider writes the AI advice ("I'm struggling"). */
  readonly aiProvider: AiProviderName;
  /**
   * The active provider's API key (MISTRAL_API_KEY or GROQ_API_KEY). The
   * advice is requested with it from the backend only: it never reaches
   * the browser.
   */
  readonly aiApiKey: string;
  /**
   * The model that writes the advice. The provider checks the id, so a wrong
   * one fails at the first call, not at startup.
   */
  readonly aiModel: string;
  /**
   * How many struggles one user may send to the model per day, counted in
   * the user's own timezone. Past it the API answers 429 and sends nothing.
   */
  readonly aiDailyLimit: number;
  /**
   * How long one advice call may take, retries included, in milliseconds.
   * Past it the API answers 503 and saves nothing.
   */
  readonly aiTimeoutMs: number;

  constructor(env: NodeJS.ProcessEnv) {
    this.databaseUrl = required(env, 'DATABASE_URL');
    this.port = parsePort(env.PORT);
    this.isProduction = env.NODE_ENV === 'production';
    this.trustProxy = parseTrustProxy(env.TRUST_PROXY);
    this.aiProvider = parseAiProvider(env.AI_PROVIDER);
    this.aiApiKey = required(env, API_KEY_VARIABLE[this.aiProvider]);
    this.aiModel = optional(env.AI_MODEL) ?? DEFAULT_AI_MODEL[this.aiProvider];
    this.aiDailyLimit = parseWholeNumber(env.AI_DAILY_LIMIT, {
      name: 'AI_DAILY_LIMIT',
      fallback: DEFAULT_AI_DAILY_LIMIT,
      min: 1,
      expected:
        'the number of advice calls a user may make per day (1 or more)',
    });
    this.aiTimeoutMs = parseWholeNumber(env.AI_TIMEOUT_MS, {
      name: 'AI_TIMEOUT_MS',
      fallback: DEFAULT_AI_TIMEOUT_MS,
      min: MIN_AI_TIMEOUT_MS,
      expected: `a number of milliseconds (${String(MIN_AI_TIMEOUT_MS)} or more)`,
    });
  }
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        'Copy backend/.env.example to backend/.env and set it.',
    );
  }
  return value;
}

/** An unset or empty variable means "use the default". */
function optional(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

function parseAiProvider(value: string | undefined): AiProviderName {
  const name = optional(value) ?? AI_PROVIDERS[0];
  if (!(AI_PROVIDERS as readonly string[]).includes(name)) {
    throw new Error(
      `Invalid environment variable AI_PROVIDER: expected one of ${AI_PROVIDERS.join(', ')}, got "${name}".`,
    );
  }
  return name as AiProviderName;
}

function parsePort(value: string | undefined): number {
  if (value === undefined || value === '') {
    return DEFAULT_PORT;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid environment variable PORT: expected a number between 1 and 65535, got "${value}".`,
    );
  }
  return port;
}

function parseTrustProxy(value: string | undefined): number {
  if (value === undefined || value === '') {
    return 0;
  }
  const hops = Number(value);
  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error(
      `Invalid environment variable TRUST_PROXY: expected the number of proxies in front of the API (0 or more), got "${value}".`,
    );
  }
  return hops;
}

function parseWholeNumber(
  value: string | undefined,
  rule: { name: string; fallback: number; min: number; expected: string },
): number {
  if (value === undefined || value === '') {
    return rule.fallback;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < rule.min) {
    throw new Error(
      `Invalid environment variable ${rule.name}: expected ${rule.expected}, got "${value}".`,
    );
  }
  return number;
}
