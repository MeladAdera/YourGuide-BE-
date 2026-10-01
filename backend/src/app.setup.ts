import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/**
 * App-wide HTTP settings. Used by main.ts and by the e2e tests,
 * so tests run against the same setup as the real server.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  // Turns the Cookie header into req.cookies, so the session cookie can be read.
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
}
