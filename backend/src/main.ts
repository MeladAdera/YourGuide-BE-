import net from 'node:net';
import { NestFactory } from '@nestjs/core';
import { setupApiDocs } from './api-docs.js';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { AppConfig } from './config/app-config.js';

// Node tries each address of a host in turn and drops an attempt after 250 ms
// by default. The round trip to the AI provider can be longer than that (a VPN
// to a server in Asia measured 270 ms on average), and then Node abandons a
// connection that was about to succeed. 1.5 s is still short for a dead route.
net.setDefaultAutoSelectFamilyAttemptTimeout(1500);

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
