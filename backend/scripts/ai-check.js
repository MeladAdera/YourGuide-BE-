/* global process, console, fetch, AbortSignal, setTimeout */
// One real call to the active provider per language, with the request the
// app sends. Run from backend/ with `pnpm ai:check`. Reads AI_PROVIDER, the
// provider's key, AI_BASE_URL and AI_MODEL from .env; prints the answers,
// the time and the tokens, never the key.
import { Mistral } from '@mistralai/mistralai';
import Groq from 'groq-sdk';

process.loadEnvFile('.env');

const PROVIDERS = {
  zai: {
    keyVariable: 'ZAI_API_KEY',
    keyRequired: true,
    defaultModel: 'glm-4.7-flash',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    extraBody: { thinking: { type: 'disabled' } },
  },
  compatible: {
    keyVariable: 'AI_API_KEY',
    keyRequired: false,
    defaultModel: null,
    baseUrl: null,
  },
  mistral: {
    keyVariable: 'MISTRAL_API_KEY',
    keyRequired: true,
    defaultModel: 'mistral-medium-latest',
  },
  groq: {
    keyVariable: 'GROQ_API_KEY',
    keyRequired: true,
    defaultModel: 'openai/gpt-oss-120b',
  },
};
const providerName = process.env.AI_PROVIDER || 'zai';
const provider = PROVIDERS[providerName];
if (provider === undefined) {
  console.error(
    `AI_PROVIDER must be one of ${Object.keys(PROVIDERS).join(', ')}`,
  );
  process.exit(1);
}
const apiKey = process.env[provider.keyVariable] || null;
if (provider.keyRequired && apiKey === null) {
  console.error(`${provider.keyVariable} is not set in backend/.env`);
  process.exit(1);
}
const model = process.env.AI_MODEL || provider.defaultModel;
if (!model) {
  console.error('AI_MODEL is not set in backend/.env');
  process.exit(1);
}
const baseUrl = (process.env.AI_BASE_URL || provider.baseUrl || '').replace(
  /\/+$/,
  '',
);
if ('baseUrl' in provider && baseUrl === '') {
  console.error('AI_BASE_URL is not set in backend/.env');
  process.exit(1);
}
const timeoutMs = 20_000;
/** As in the app's OpenAI-style adapter: a 429, a 5xx or a failed connection is tried again. */
const RETRY = { attempts: 3, baseDelayMs: 1000 };

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
// The same instruction once more, as the last line the model reads: GLM
// ignores a system-only rule when the text is English (tried 2026-10-19).
const closing = {
  en: 'Language: write both "advice" and "nextStep" in English, whatever language the text above is in.',
  ar: 'Language: write both "advice" and "nextStep" in Arabic, whatever language the text above is in.',
};
const struggle =
  'I have read about SQL JOIN three times and still cannot write one. I am stuck.';
const system = (languageLine) =>
  `You are a kind study companion. Answer with a JSON object with exactly two string fields: "advice" (two sentences) and "nextStep" (one action doable in minutes). ${languageLine}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Each call answers { text, model, finish, promptTokens, completionTokens }. */
const calls = {
  zai: (languageLine, user) => calls.compatible(languageLine, user),
  async compatible(languageLine, user) {
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json',
    };
    if (apiKey !== null) headers.authorization = `Bearer ${apiKey}`;
    const body = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system(languageLine) },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2048,
      temperature: 0.7,
      stream: false,
      ...(provider.extraBody ?? {}),
    });
    for (let attempt = 1; ; attempt++) {
      let response;
      try {
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (!(error instanceof TypeError) || attempt >= RETRY.attempts)
          throw error;
        console.log(`  (connection failed, attempt ${attempt}; trying again)`);
        await sleep(RETRY.baseDelayMs * 2 ** (attempt - 1));
        continue;
      }
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < RETRY.attempts) {
          console.log(
            `  (HTTP ${response.status}, attempt ${attempt}; trying again)`,
          );
          await sleep(RETRY.baseDelayMs * 2 ** (attempt - 1));
          continue;
        }
        const error = new Error((await response.text()).slice(0, 300));
        error.status = response.status;
        throw error;
      }
      const json = await response.json();
      const choice = json.choices?.[0] ?? {};
      const content = choice.message?.content;
      const text = typeof content === 'string' ? content : '';
      return {
        text: text
          .trim()
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/, ''),
        model: json.model ?? model,
        finish: choice.finish_reason,
        promptTokens: json.usage?.prompt_tokens,
        completionTokens: json.usage?.completion_tokens,
      };
    }
  },
  async mistral(languageLine, user) {
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
  async groq(languageLine, user) {
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

console.log(
  `provider=${providerName} model=${model}${baseUrl ? ` baseUrl=${baseUrl}` : ''}`,
);
let failed = false;
for (const [locale, languageLine] of Object.entries(languages)) {
  const user = `${struggle}\n\n${closing[locale]}`;
  const startedAt = Date.now();
  try {
    const answer = await calls[providerName](languageLine, user);
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
        "  429 is the plan's rate or concurrency limit, still there after the retries.",
      );
    }
  }
}
process.exit(failed ? 1 : 0);
