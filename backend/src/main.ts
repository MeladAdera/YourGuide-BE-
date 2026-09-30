import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { AppConfig } from './config/app-config.js';

const app = await NestFactory.create(AppModule);
configureApp(app);
// Lets Ctrl+C / SIGTERM run onApplicationShutdown, which closes the pool.
app.enableShutdownHooks();
await app.listen(app.get(AppConfig).port);
