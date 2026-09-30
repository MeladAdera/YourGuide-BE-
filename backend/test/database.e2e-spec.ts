import { INestApplication } from '@nestjs/common';
import { DatabaseService } from '../src/database/database.service.js';
import { createTestApp } from './helpers/create-test-app.js';

describe('DatabaseService.withTransaction', () => {
  let app: INestApplication;
  let db: DatabaseService;

  async function countRows(): Promise<number | undefined> {
    const { rows } = await db.pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM transaction_probe',
    );
    return rows[0]?.count;
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(DatabaseService);
    await db.pool.query(
      'CREATE TABLE IF NOT EXISTS transaction_probe (id integer PRIMARY KEY)',
    );
  });

  afterAll(async () => {
    await db.pool.query('DROP TABLE IF EXISTS transaction_probe');
    await app.close();
  });

  it('commits the insert when the work succeeds', async () => {
    const result = await db.withTransaction(async (client) => {
      await client.query('INSERT INTO transaction_probe (id) VALUES (1)');
      return 'finished';
    });

    expect(result).toBe('finished');
    expect(await countRows()).toBe(1);
  });

  it('rolls back the insert when the work throws', async () => {
    await expect(
      db.withTransaction(async (client) => {
        await client.query('INSERT INTO transaction_probe (id) VALUES (1)');
        throw new Error('something failed after the insert');
      }),
    ).rejects.toThrow('something failed after the insert');

    expect(await countRows()).toBe(0);
  });

  it('gives the client back to the pool after a rollback', async () => {
    await expect(
      db.withTransaction(() => Promise.reject(new Error('fail'))),
    ).rejects.toThrow('fail');

    expect(db.pool.idleCount).toBe(db.pool.totalCount);
  });
});
