import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { API_ERRORS } from '../src/common/api-error.js';
import { createTestApp } from './helpers/create-test-app.js';

interface OpenApiDocument {
  paths: Record<string, Record<string, { security?: object[] }>>;
  components: {
    schemas: Record<
      string,
      { properties?: Record<string, { type?: string; enum?: string[] }> }
    >;
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
      '/api/goals',
      '/api/goals/{goalId}/tasks',
      '/api/goals/{id}',
      '/api/goals/{id}/archive',
      '/api/goals/{id}/unarchive',
      '/api/health',
      '/api/profile',
      '/api/profile/onboarding',
      '/api/profile/sections/achievements',
      '/api/profile/sections/basics',
      '/api/profile/sections/confidence',
      '/api/profile/sections/patterns',
      '/api/profile/sections/self-view',
      '/api/profile/sections/situation',
      '/api/profile/sections/values',
      '/api/steps/{id}',
      '/api/tasks/{id}',
      '/api/tasks/{taskId}/steps',
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
      'locale',
    ]);
  });

  it('publishes the shape of an error and the list of error codes', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs-json');

    const { schemas } = (response.body as OpenApiDocument).components;
    expect(Object.keys(schemas['ApiErrorBody']?.properties ?? {})).toEqual([
      'statusCode',
      'error',
      'code',
      'message',
    ]);
    expect(schemas['ApiErrorBody']?.properties?.['code']?.enum).toEqual(
      Object.keys(API_ERRORS),
    );
    expect(
      Object.keys(schemas['ValidationErrorBody']?.properties ?? {}),
    ).toEqual(['statusCode', 'error', 'code', 'message', 'errors']);
    expect(Object.keys(schemas['FieldError']?.properties ?? {})).toEqual([
      'field',
      'code',
    ]);
  });

  it('marks GET /auth/me as needing the session cookie', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs-json');

    const document = response.body as OpenApiDocument;
    expect(document.paths['/api/auth/me']?.get?.security).toEqual([
      { cookie: [] },
    ]);
    expect(document.paths['/api/auth/me']?.patch?.security).toEqual([
      { cookie: [] },
    ]);
    expect(document.paths['/api/auth/login']?.post?.security).toBeUndefined();
  });
});
