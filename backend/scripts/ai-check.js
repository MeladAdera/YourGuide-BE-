/* global process, console */
// One real call to the active provider per language, with the request the
// app sends. Run from backend/ with `pnpm ai:check`. Reads AI_PROVIDER,
// the provider's key and AI_MODEL from .env; prints the answers, the time
// and the tokens, never the key.
import { Mistral } from '@mistralai/mistralai';
import Groq from 'groq-sdk';

process.loadEnvFile('.env');

const PROVIDERS = {
  mistral: {
    keyVariable: 'MISTRAL_API_KEY',
    defaultModel: 'mistral-medium-latest',
  },
  groq: { keyVariable: 'GROQ_API_KEY', defaultModel: 'openai/gpt-oss-120b' },
};
const providerName = process.env.AI_PROVIDER || 'mistral';
const provider = PROVIDERS[providerName];
if (provider === undefined) {
  console.error(
    `AI_PROVIDER must be one of ${Object.keys(PROVIDERS).join(', ')}`,
  );
  process.exit(1);
}
const apiKey = process.env[provider.keyVariable];
if (apiKey === undefined || apiKey === '') {
  console.error(`${provider.keyVariable} is not set in backend/.env`);
  process.exit(1);
}
const model = process.env.AI_MODEL || provider.defaultModel;
const timeoutMs = 20_000;

const schema = {
  type: 'object',
  properties: { advice: { type: 'string' }, nextStep: { type: 'string' } },
  required: ['advice', 'nextStep'],
  additionalProperties: false,
};
const languages = {
  en: 'Write both fields in English.',
  ar: 'Write both fields in Arabic, without assuming whether the reader is a man or a woman.',
};
const user =
  'I have read about SQL JOIN three times and still cannot write one. I am stuck.';
const system = (languageLine) =>
  `You are a kind study companion. Answer with a JSON object with two string fields: "advice" (two sentences) and "nextStep" (one action doable in minutes). ${languageLine}`;

/** Each call answers { text, model, finish, promptTokens, completionTokens }. */
const calls = {
  async mistral(languageLine) {
    const client = new Mistral({ apiKey, timeoutMs });
    const response = await client.chat.complete({
      model,
      messages: [
        { role: 'system', content: system(languageLine) },
        { role: 'user', content: user },
      ],
      responseFormat: {
        type: 'json_schema',
        jsonSchema: { name: 'advice', schemaDefinition: schema, strict: true },
      },
      reasoningEffort: 'none',
      maxTokens: 2048,
      temperature: 0.7,
    });
    const choice = response.choices[0];
    const content = choice.message?.content;
    const text =
      typeof content === 'string'
        ? content
        : (content ?? [])
            .filter((c) => c.type === 'text')
            .map((c) => c.text)
            .join('');
    return {
      text,
      model: response.model,
      finish: choice.finishReason,
      promptTokens: response.usage?.promptTokens,
      completionTokens: response.usage?.completionTokens,
    };
  },
  async groq(languageLine) {
    const client = new Groq({ apiKey, maxRetries: 0, timeout: timeoutMs });
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system(languageLine) },
        { role: 'user', content: user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'advice', strict: true, schema },
      },
      reasoning_effort: 'low',
      include_reasoning: false,
      max_completion_tokens: 2048,
      temperature: 0.7,
    });
    const choice = response.choices[0];
    return {
      text: choice.message.content ?? '',
      model: response.model,
      finish: choice.finish_reason,
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
    };
  },
};

console.log(`provider=${providerName} model=${model}`);
let failed = false;
for (const [locale, languageLine] of Object.entries(languages)) {
  const startedAt = Date.now();
  try {
    const answer = await calls[providerName](languageLine);
    console.log(`\n[${locale}] OK in ${Date.now() - startedAt} ms`);
    console.log(
      `  model=${answer.model} finish=${answer.finish} promptTokens=${answer.promptTokens} completionTokens=${answer.completionTokens}`,
    );
    const parsed = JSON.parse(answer.text);
    console.log(`  advice:   ${parsed.advice}`);
    console.log(`  nextStep: ${parsed.nextStep}`);
  } catch (error) {
    failed = true;
    const status = error.statusCode ?? error.status;
    console.log(`\n[${locale}] FAILED after ${Date.now() - startedAt} ms`);
    console.log(
      `  ${error.constructor.name}${status ? ` (HTTP ${status})` : ''}: ${error.message}`,
    );
    if (status === 401) {
      console.log(
        `  401 means the key is wrong. Check ${provider.keyVariable} in backend/.env.`,
      );
    } else if (status === 403) {
      console.log(
        '  403 means the provider does not serve this network or location.',
      );
    } else if (status === 429) {
      console.log(
        "  429 is the plan's rate limit. Wait a minute and try again.",
      );
    }
  }
}
process.exit(failed ? 1 : 0);
