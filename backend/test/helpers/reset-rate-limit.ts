import { INestApplication } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';

/**
 * The rate limit counts requests in memory, so one test's register and login
 * calls would count against the next test. Call this in beforeEach, the same
 * way the database is emptied before every test.
 */
export function resetRateLimits(app: INestApplication): void {
  const storage = app.get<ThrottlerStorageService>(ThrottlerStorage);
  storage.storage.clear();
  // Since @nestjs/throttler 6.7 the service also keeps the time of every hit
  // in a second, private map, and rebuilds the count from it. Both must go.
  const { hitExpirations } = storage as unknown as {
    hitExpirations?: Map<string, unknown>;
  };
  if (!(hitExpirations instanceof Map)) {
    throw new Error(
      'ThrottlerStorageService has changed: update resetRateLimits()',
    );
  }
  hitExpirations.clear();
}
