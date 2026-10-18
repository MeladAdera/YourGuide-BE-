import { Mistral } from '@mistralai/mistralai';
import { Module } from '@nestjs/common';
import Groq from 'groq-sdk';
import { AiProviderName, AppConfig } from '../config/app-config.js';
import { AI_PROVIDER, AiProvider } from './ai-provider.js';
import { AiService } from './ai.service.js';
import { GroqProvider } from './groq.provider.js';
import { MistralProvider } from './mistral.provider.js';

/**
 * How each provider's client is built. The SDKs retry rate limits and server
 * errors on their own, with a pause between tries; the provider's deadline
 * caps the whole call either way.
 */
const PROVIDERS: Record<AiProviderName, (config: AppConfig) => AiProvider> = {
  mistral: (config) =>
    new MistralProvider(
      new Mistral({
        apiKey: config.aiApiKey,
        timeoutMs: config.aiTimeoutMs,
        retryConfig: {
          strategy: 'backoff',
          backoff: {
            initialInterval: 500,
            maxInterval: 4_000,
            exponent: 1.5,
            maxElapsedTime: config.aiTimeoutMs,
          },
          retryConnectionErrors: true,
        },
      }),
      { model: config.aiModel, timeoutMs: config.aiTimeoutMs },
    ),
  groq: (config) =>
    new GroqProvider(
      new Groq({
        apiKey: config.aiApiKey,
        timeout: config.aiTimeoutMs,
        maxRetries: 2,
      }),
      { model: config.aiModel, timeoutMs: config.aiTimeoutMs },
    ),
};

/**
 * All calls to a language model. Other modules inject `AiService`; the
 * provider behind it is chosen here and only here, by `AI_PROVIDER`.
 */
@Module({
  providers: [
    {
      provide: AI_PROVIDER,
      useFactory: (config: AppConfig): AiProvider =>
        PROVIDERS[config.aiProvider](config),
      inject: [AppConfig],
    },
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
