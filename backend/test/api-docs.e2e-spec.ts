import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp } from './helpers/create-test-app.js';

interface OpenApiDocument {
  paths: Record<string, Record<string, { security?: object[] }>>;
  components: {
    schemas: Record<string, { properties?: Record<string, { type?: string }> }>;
  };
}

describe('API docs', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp({ apiDocs: true });
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the Swagger UI page without a login', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs');

    expect(response.status).toBe(200);
    expect(response.type).toBe('text/html');
  });

  it('lists every route in the OpenAPI file', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs-json');

    expect(response.status).toBe(200);
    const document = response.body as OpenApiDocument;
    expect(Object.keys(document.paths).sort()).toEqual([
      '/api/auth/login',
      '/api/auth/logout',
      '/api/auth/me',
      '/api/auth/register',
      '/api/health',
      '/api/profile',
    ]);
  });

  it('describes the request and response bodies field by field', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs-json');

    const { schemas } = (response.body as OpenApiDocument).components;
    expect(Object.keys(schemas['LoginDto']?.properties ?? {})).toEqual([
      'email',
      'password',
    ]);
    expect(schemas['LoginDto']?.properties?.['email']?.type).toBe('string');
    expect(Object.keys(schemas['User']?.properties ?? {})).toEqual([
      'id',
      'email',
      'timezone',
    ]);
  });

  it('marks GET /auth/me as needing the session cookie', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs-json');

    const document = response.body as OpenApiDocument;
    expect(document.paths['/api/auth/me']?.get?.security).toEqual([
      { cookie: [] },
    ]);
    expect(document.paths['/api/auth/login']?.post?.security).toBeUndefined();
  });
});
