import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { AppConfig } from '../config/app-config.js';

/**
 * Anything that can run a query: the pool, or a client inside a transaction.
 * Repository methods take an Executor as their first argument, so the same
 * method works with and without a transaction.
 */
export type Executor = Pool | PoolClient;

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly pool: Pool;
  private readonly logger = new Logger(DatabaseService.name);

  constructor(config: AppConfig) {
    this.pool = new Pool({ connectionString: config.databaseUrl });
    // Without a listener, an error on an idle connection (e.g. PostgreSQL
    // restarting) would crash the whole process.
    this.pool.on('error', (error) => {
      this.logger.error('Idle database connection failed', error.stack);
    });
  }

  /**
   * Runs `work` inside one transaction: COMMIT if it resolves, ROLLBACK if it
   * throws. Pass the client to every repository call inside `work`.
   */
  async withTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
