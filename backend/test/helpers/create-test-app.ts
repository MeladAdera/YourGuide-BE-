import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types.js';
import { setupApiDocs } from '../../src/api-docs.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';

/**
 * The real app, configured exactly like main.ts. Close it in afterAll.
 * `apiDocs` also serves Swagger, as main.ts does outside production.
 */
export async function createTestApp(
  options: { apiDocs?: boolean } = {},
): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  if (options.apiDocs === true) {
    setupApiDocs(app);
  }
  await app.init();
  return app;
}
