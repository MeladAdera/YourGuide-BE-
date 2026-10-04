import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SESSION_COOKIE } from './auth/session-cookie.js';
import { ApiErrorBody } from './common/api-error.js';

/** Swagger UI lives here; the OpenAPI file at `${API_DOCS_PATH}-json`. */
export const API_DOCS_PATH = 'api/docs';

/**
 * Builds the OpenAPI document from the controllers and serves Swagger UI.
 * Development only: main.ts skips it in production.
 */
export function setupApiDocs(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Your Guide API')
    .setDescription(
      'Call POST /api/auth/login (or /register) first. The browser keeps the ' +
        'session cookie, so the protected routes work from this page afterwards. ' +
        'The "Authorize" button cannot set the cookie: browsers do not let a ' +
        'page write the Cookie header.\n\n' +
        'Every error answers with a `code` (see ApiErrorBody under Schemas). ' +
        'The code is what a client translates; the `message` is English, ' +
        'for developers.',
    )
    .setVersion('0.0.0')
    // Documents how the API authenticates. Routes marked @ApiCookieAuth()
    // show a lock icon.
    .addCookieAuth(SESSION_COOKIE)
    .build();

  // No route returns ApiErrorBody as its success type, so Swagger would not
  // find it by itself.
  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [ApiErrorBody],
  });
  SwaggerModule.setup(API_DOCS_PATH, app, document, {
    customSiteTitle: 'Your Guide API',
  });
}
