import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types.js';
import { AI_PROVIDER, AiProvider } from '../../src/ai/ai-provider.js';
import { setupApiDocs } from '../../src/api-docs.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { FakeAi } from './fake-ai.js';

/**
 * The real app, configured exactly like main.ts. Close it in afterAll.
 * `apiDocs` also serves Swagger, as main.ts does outside production.
 * The model is always a fake (`ai`, default `new FakeAi()`): no test and no
 * Swagger example can reach Groq.
 */
export async function createTestApp(
  options: { apiDocs?: boolean; ai?: AiProvider } = {},
): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(AI_PROVIDER)
    .useValue(options.ai ?? new FakeAi())
    .compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  if (options.apiDocs === true) {
    setupApiDocs(app);
  }
  await app.init();
  return app;
}
