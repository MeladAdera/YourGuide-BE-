import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp } from './helpers/create-test-app.js';

// Errors the API throws on purpose are checked next to their feature
// (auth, profile, goals). These are the ones NestJS throws by itself:
// they must carry a code too, or a client has nothing to translate by.
// The other two are checked where they happen: an id that is not a UUID
// in goals, the rate limit in auth-rate-limit.
describe('error codes', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('gives an unknown route under /api the code not_found', async () => {
    const response = await request(app.getHttpServer()).get('/api/nothing');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      code: 'not_found',
      message: 'Cannot GET /api/nothing',
    });
  });
});
