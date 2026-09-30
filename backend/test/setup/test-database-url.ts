/**
 * The e2e tests delete every row between tests, so they must never run
 * against a real database. This refuses any database not named *_test.
 */
export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '') {
    throw new Error('DATABASE_URL is not set for the e2e tests.');
  }
  const databaseName = new URL(url).pathname.slice(1);
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to run e2e tests against "${databaseName}": ` +
        'the database name must end with _test.',
    );
  }
  return url;
}
