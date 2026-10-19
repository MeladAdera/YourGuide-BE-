const DEFAULT_PORT = 3001;
const DEFAULT_AI_DAILY_LIMIT = 10;
const DEFAULT_AI_TIMEOUT_MS = 20_000;
const MIN_AI_TIMEOUT_MS = 1_000;

/**
 * The language-model providers the backend can talk to. One is active,
 * chosen by AI_PROVIDER; its own key variable is then required.
 *
 * - `zai`: Z.ai's free GLM Flash models, through its OpenAI-style API.
 *   GLM-4.5-Flash by default: GLM-4.7-Flash writes better but was slow and
 *   overloaded when measured (2026-10-19); AI_MODEL switches between them.
 * - `compatible`: any other OpenAI-style endpoint (a local Ollama, Ollama
 *   cloud, Cloudflare Workers AI, Qwen, DeepSeek), by AI_BASE_URL.
 * - `mistral`, `groq`: through their own SDKs.
 *
 * Z.ai is the default: free with no time limit, and it answers from the
 * developer's network.
 */
export const AI_PROVIDERS = ['zai', 'compatible', 'mistral', 'groq'] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];

interface ProviderPreset {
  /** The variable that holds the key. */
  keyVariable: string;
  /** False for an endpoint that needs no key, such as a local model. */
  keyRequired: boolean;
  /** The OpenAI-style base URL, when the preset fixes one. */
  baseUrl: string | null;
  /** Null when AI_MODEL must be set by hand. */
  defaultModel: string | null;
}

const PRESETS: Record<AiProviderName, ProviderPreset> = {
  zai: {
    keyVariable: 'ZAI_API_KEY',
    keyRequired: true,
    baseUrl: 'https://api.z.ai/api/paas/v4',
    defaultModel: 'glm-4.5-flash',
  },
  compatible: {
    keyVariable: 'AI_API_KEY',
    keyRequired: false,
    baseUrl: null,
    defaultModel: null,
  },
  mistral: {
    keyVariable: 'MISTRAL_API_KEY',
    keyRequired: true,
    baseUrl: null,
    defaultModel: 'mistral-medium-latest',
  },
  groq: {
    keyVariable: 'GROQ_API_KEY',
    keyRequired: true,
    baseUrl: null,
    defaultModel: 'openai/gpt-oss-120b',
  },
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
   * The active provider's API key, from its own variable (ZAI_API_KEY,
   * AI_API_KEY, MISTRAL_API_KEY or GROQ_API_KEY). Null only for a
   * `compatible` endpoint that needs none. Used from the backend only: it
   * never reaches the browser.
   */
  readonly aiApiKey: string | null;
  /**
   * The OpenAI-style base URL for `zai` and `compatible`: the one the
   * preset fixes, or AI_BASE_URL. Null for the SDK providers.
   */
  readonly aiBaseUrl: string | null;
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
    const preset = PRESETS[this.aiProvider];
    this.aiApiKey = preset.keyRequired
      ? required(env, preset.keyVariable)
      : (optional(env[preset.keyVariable]) ?? null);
    this.aiBaseUrl = parseBaseUrl(env.AI_BASE_URL, preset);
    this.aiModel =
      optional(env.AI_MODEL) ??
      preset.defaultModel ??
      required(env, 'AI_MODEL');
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

/**
 * The base URL for an OpenAI-style endpoint. A preset's URL can be
 * overridden; `compatible` has none and must be given one. A trailing
 * slash is dropped, so `/chat/completions` can be appended.
 */
function parseBaseUrl(
  value: string | undefined,
  preset: ProviderPreset,
): string | null {
  const given = optional(value);
  if (given === undefined) {
    if (preset.baseUrl !== null) {
      return preset.baseUrl;
    }
    if (preset.keyRequired) {
      return null; // an SDK provider: no base URL
    }
    throw new Error(
      'Missing required environment variable: AI_BASE_URL. ' +
        'With AI_PROVIDER=compatible it names the OpenAI-style endpoint, e.g. http://127.0.0.1:11434/v1.',
    );
  }
  if (!/^https?:\/\//.test(given)) {
    throw new Error(
      `Invalid environment variable AI_BASE_URL: expected an http(s) URL, got "${given}".`,
    );
  }
  return given.replace(/\/+$/, '');
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
