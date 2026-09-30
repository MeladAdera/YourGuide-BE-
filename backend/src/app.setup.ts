import { INestApplication, ValidationPipe } from '@nestjs/common';

/**
 * App-wide HTTP settings. Used by main.ts and by the e2e tests,
 * so tests run against the same setup as the real server.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
}
