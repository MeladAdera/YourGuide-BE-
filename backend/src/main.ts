import { NestFactory } from '@nestjs/core';
import { setupApiDocs } from './api-docs.js';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { AppConfig } from './config/app-config.js';

const app = await NestFactory.create(AppModule);
const config = app.get(AppConfig);
configureApp(app);
// The docs page is a development tool. In production only the web app
// talks to the API.
if (!config.isProduction) {
  setupApiDocs(app);
}
// Lets Ctrl+C / SIGTERM run onApplicationShutdown, which closes the pool.
app.enableShutdownHooks();
await app.listen(config.port);
