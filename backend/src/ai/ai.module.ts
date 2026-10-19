import { Mistral } from '@mistralai/mistralai';
import { Module } from '@nestjs/common';
import Groq from 'groq-sdk';
import { AiProviderName, AppConfig } from '../config/app-config.js';
import { AI_PROVIDER, AiProvider } from './ai-provider.js';
import { AiService } from './ai.service.js';
import { OpenAiCompatibleProvider } from './compatible.provider.js';
import { GroqProvider } from './groq.provider.js';
import { MistralProvider } from './mistral.provider.js';

/** The config guarantees a base URL for the two OpenAI-style providers. */
function baseUrlOf(config: AppConfig): string {
  if (config.aiBaseUrl === null) {
    throw new Error(`AI_PROVIDER=${config.aiProvider} needs a base URL.`);
  }
  return config.aiBaseUrl;
}

/** The config guarantees a key for the SDK providers. */
function keyOf(config: AppConfig): string {
  if (config.aiApiKey === null) {
    throw new Error(`AI_PROVIDER=${config.aiProvider} needs an API key.`);
  }
  return config.aiApiKey;
}

/**
 * How each provider's client is built. The SDKs retry rate limits and server
 * errors on their own, with a pause between tries; the OpenAI-style adapter
 * does not retry. The provider's deadline caps the whole call either way.
 */
const PROVIDERS: Record<AiProviderName, (config: AppConfig) => AiProvider> = {
  zai: (config) =>
    new OpenAiCompatibleProvider({
      baseUrl: baseUrlOf(config),
      apiKey: config.aiApiKey,
      model: config.aiModel,
      timeoutMs: config.aiTimeoutMs,
      // GLM thinks before it answers unless told not to. The advice is not a
      // maths problem, and the thinking would count against the free plan.
      extraBody: { thinking: { type: 'disabled' } },
    }),
  compatible: (config) =>
    new OpenAiCompatibleProvider({
      baseUrl: baseUrlOf(config),
      apiKey: config.aiApiKey,
      model: config.aiModel,
      timeoutMs: config.aiTimeoutMs,
    }),
  mistral: (config) =>
    new MistralProvider(
      new Mistral({
        apiKey: keyOf(config),
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
        apiKey: keyOf(config),
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
