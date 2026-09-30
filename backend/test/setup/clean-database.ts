import { Client } from 'pg';
import { testDatabaseUrl } from './test-database-url.js';

// Runs before every test: empty all tables, so no test depends on the rows
// another test left behind. The migrations table is kept.
beforeEach(async () => {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    const { rows } = await client.query<{ name: string }>(
      `SELECT quote_ident(tablename) AS name
         FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> 'pgmigrations'`,
    );
    if (rows.length > 0) {
      const tables = rows.map((row) => row.name).join(', ');
      await client.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await client.end();
  }
});
