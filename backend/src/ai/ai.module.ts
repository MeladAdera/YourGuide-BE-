import { Module } from '@nestjs/common';
import Groq from 'groq-sdk';
import { AppConfig } from '../config/app-config.js';
import { AI_PROVIDER, AiProvider } from './ai-provider.js';
import { AiService } from './ai.service.js';
import { GroqProvider } from './groq.provider.js';

/**
 * All calls to a language model. Other modules inject `AiService`; the
 * provider behind it is chosen here and only here.
 */
@Module({
  providers: [
    {
      provide: AI_PROVIDER,
      useFactory: (config: AppConfig): AiProvider =>
        new GroqProvider(
          new Groq({
            apiKey: config.groqApiKey,
            // Per attempt; the provider's own deadline caps the whole call.
            timeout: config.aiTimeoutMs,
            // 429 and 5xx are retried with a pause in between (the default).
            maxRetries: 2,
          }),
          { model: config.aiModel, timeoutMs: config.aiTimeoutMs },
        ),
      inject: [AppConfig],
    },
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
