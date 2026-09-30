import { runner } from 'node-pg-migrate';
import { testDatabaseUrl } from './test-database-url.js';

// Runs once, before the whole e2e suite: bring the test database up to date.
export default async function setup(): Promise<void> {
  await runner({
    databaseUrl: testDatabaseUrl(),
    dir: 'migrations',
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => undefined,
  });
}
