const DEFAULT_PORT = 3001;

/**
 * Every environment variable the API uses, read and validated once at startup.
 * Inject this class instead of reading `process.env`.
 */
export class AppConfig {
  readonly databaseUrl: string;
  readonly port: number;

  constructor(env: NodeJS.ProcessEnv) {
    this.databaseUrl = required(env, 'DATABASE_URL');
    this.port = parsePort(env.PORT);
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
