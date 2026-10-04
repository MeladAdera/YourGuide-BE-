import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import { ErrorCodeFilter } from './common/error-code.filter.js';
import { AppConfig } from './config/app-config.js';

/**
 * App-wide HTTP settings. Used by main.ts and by the e2e tests,
 * so tests run against the same setup as the real server.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfig);
  app.setGlobalPrefix('api');
  // Behind a proxy, every connection comes from the proxy's IP. "trust proxy"
  // makes req.ip the real client's IP, read from X-Forwarded-For. Off by
  // default: with no proxy, trusting that header lets anyone pick their IP.
  if (config.trustProxy > 0) {
    const express = app.getHttpAdapter().getInstance() as Express;
    express.set('trust proxy', config.trustProxy);
  }
  // Turns the Cookie header into req.cookies, so the session cookie can be read.
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  // Every error answer gets a code, the name a client translates by.
  app.useGlobalFilters(new ErrorCodeFilter());
}
