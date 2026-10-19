/* global process, console, fetch, AbortSignal, setTimeout */
// The real prompt, through the app's own buildPrompt, for each of the four
// situations in both languages, sent to one or more Z.ai models in turn.
// Run from backend/ after `pnpm build`:  node scripts/ai-compare.js glm-4.5-flash glm-4.7-flash
// Prints one line per answer and writes every full answer to a JSON file.
// Reads ZAI_API_KEY from .env; never prints it.
import net from 'node:net';
import { writeFileSync } from 'node:fs';
import { buildPrompt } from '../dist/struggles/prompt/build-prompt.js';

process.loadEnvFile('.env');
net.setDefaultAutoSelectFamilyAttemptTimeout(1500);

const apiKey = process.env.ZAI_API_KEY;
if (!apiKey) {
  console.error('ZAI_API_KEY is not set in backend/.env');
  process.exit(1);
}
const models = process.argv.slice(2);
if (models.length === 0) {
  console.error(
    'Give the model ids to compare, e.g. glm-4.5-flash glm-4.7-flash',
  );
  process.exit(1);
}
const outFile = process.env.AI_COMPARE_OUT || 'ai-compare.out.json';

// A made-up person: a junior developer learning PostgreSQL to ship a product.
const updatedAt = new Date('2026-10-01T10:00:00.000Z');
const profile = {
  basics: {
    employmentStatus: 'employed',
    ageRange: '25_34',
    country: 'SY',
    educationLevel: 'bachelor',
    occupation: 'junior developer',
    yearsExperience: '2_5',
    updatedAt,
  },
  situation: {
    typicalDay: 'Work until six, then an hour of study that I often skip.',
    wantToChange: 'Study every evening, not only when I feel like it.',
    satisfiedWith: null,
    wishMoreTimeFor: 'Building my own project.',
    updatedAt,
  },
  achievements: {
    proudOf: 'Finished a six-month course while working full time.',
    whatWasHard: 'Keeping going in the last two months.',
    learnedAboutSelf: 'I keep going when I have a plan on paper.',
    updatedAt,
  },
  patterns: {
    oftenPostpone: 'Starting anything that needs reading first.',
    lessonFromMistake: 'Guessing instead of reading the docs costs more.',
    patternToChange: 'Opening my phone when a task feels hard.',
    updatedAt,
  },
  selfView: {
    whoIAm: 'Curious, slow to start, stubborn once started.',
    goodAt: 'Explaining things.',
    othersComeToMeFor: 'Calm advice.',
    stillFiguringOut: 'How to study without a deadline.',
    updatedAt,
  },
  confidence: {
    canLearnIfPersist: 5,
    canTryAgain: 3,
    followThrough: 2,
    focusWithoutMotivation: 1,
    actionsShapeFuture: 4,
    doubtDespiteEvidence: 4,
    avoidWhenAfraid: 3,
    compareTooMuch: 5,
    updatedAt,
  },
  values: {
    values: [
      { value: 'family', note: null },
      { value: 'learning', note: 'the thing I never regret' },
    ],
    personToBecome: 'Someone who finishes what they start.',
    wouldRegretNotDoing: 'Shipping something of my own.',
    rememberedFor: 'Being reliable.',
    updatedAt,
  },
};
const goal = {
  id: 'goal-1',
  title: 'Ship my first product',
  whyItMatters: 'To prove to myself I can finish something of my own.',
  obstacle: 'Evenings disappear into my phone.',
  firstOutcome: 'A landing page that one stranger signs up on.',
  createdAt: updatedAt,
  archivedAt: null,
};
const session = {
  id: 'session-1',
  startedAt: new Date(),
  endedAt: null,
  step: { id: 'step-1', title: 'Understand SELECT with JOIN' },
  task: { id: 'task-1', title: 'Learn PostgreSQL' },
  goal: { id: 'goal-1', title: 'Ship my first product' },
};
const progress = [
  {
    date: '2026-10-13',
    focusMinutes: 0,
    stepsDone: 0,
    struggledAndContinued: 0,
  },
  {
    date: '2026-10-14',
    focusMinutes: 25,
    stepsDone: 1,
    struggledAndContinued: 1,
  },
  {
    date: '2026-10-15',
    focusMinutes: 0,
    stepsDone: 0,
    struggledAndContinued: 0,
  },
  {
    date: '2026-10-16',
    focusMinutes: 40,
    stepsDone: 1,
    struggledAndContinued: 0,
  },
  {
    date: '2026-10-17',
    focusMinutes: 0,
    stepsDone: 0,
    struggledAndContinued: 0,
  },
  {
    date: '2026-10-18',
    focusMinutes: 30,
    stepsDone: 0,
    struggledAndContinued: 1,
  },
  {
    date: '2026-10-19',
    focusMinutes: 10,
    stepsDone: 0,
    struggledAndContinued: 0,
  },
];
const pastStruggles = [
  {
    situation: 'tired',
    description: 'Too tired after work to open the laptop.',
    advice: "Write tomorrow's first step down and stop for today.",
    nextStep: 'Write one line: tomorrow, open the orders table.',
    continued: false,
    createdAt: new Date('2026-10-18T19:00:00.000Z'),
  },
  {
    situation: 'stuck',
    description: 'JOIN makes no sense to me.',
    advice: 'Start with two tables and one matching column.',
    nextStep: 'Join orders to customers on customer_id.',
    continued: true,
    createdAt: new Date('2026-10-14T19:00:00.000Z'),
  },
];
const descriptions = {
  en: {
    stuck:
      'I have read about JOIN three times and still cannot write one that returns the right rows.',
    tired:
      'It is 10 pm, I worked all day, and I promised myself one hour of study. I have nothing left.',
    comparing:
      'A friend who started after me already has a product online. I am still on SELECT.',
    negative_thought:
      'Maybe I am just not made for programming. Real developers do not get stuck on basics.',
  },
  ar: {
    stuck:
      'قرأت عن JOIN ثلاث مرات وما زلت لا أستطيع كتابة استعلام يرجع الصفوف الصحيحة.',
    tired:
      'الساعة العاشرة مساءً، عملت طوال اليوم، ووعدت نفسي بساعة دراسة. لم يبق لدي أي طاقة.',
    comparing:
      'صديق بدأ بعدي لديه منتج على الإنترنت بالفعل، وأنا ما زلت عند SELECT.',
    negative_thought:
      'ربما أنا ببساطة لست مخلوقاً للبرمجة. المبرمجون الحقيقيون لا يعلقون عند الأساسيات.',
  },
};

const arabicShare = (text) => {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length === 0) return 0;
  return (letters.match(/[؀-ۿ]/g) ?? []).length / letters.length;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ask(model, prompt) {
  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 2048,
    temperature: 0.7,
    stream: false,
    thinking: { type: 'disabled' },
  });
  for (let attempt = 1; ; attempt++) {
    let response;
    try {
      response = await fetch('https://api.z.ai/api/paas/v4/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body,
        signal: AbortSignal.timeout(45_000),
      });
    } catch (error) {
      if (attempt >= 4) throw error;
      await sleep(1500 * attempt);
      continue;
    }
    if (!response.ok) {
      const text = (await response.text()).slice(0, 200);
      if ((response.status === 429 || response.status >= 500) && attempt < 4) {
        await sleep(2000 * attempt);
        continue;
      }
      throw new Error(`HTTP ${response.status} ${text}`);
    }
    const json = await response.json();
    const content = json.choices?.[0]?.message?.content ?? '';
    return {
      text: content
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, ''),
      finish: json.choices?.[0]?.finish_reason,
      promptTokens: json.usage?.prompt_tokens,
      completionTokens: json.usage?.completion_tokens,
    };
  }
}

const results = [];
for (const model of models) {
  console.log(`\n=== ${model} ===`);
  for (const locale of ['en', 'ar']) {
    for (const situation of [
      'stuck',
      'tired',
      'comparing',
      'negative_thought',
    ]) {
      const prompt = buildPrompt({
        locale,
        profile,
        session,
        goals: [goal],
        progress,
        pastStruggles,
        situation,
        description: descriptions[locale][situation],
      });
      const startedAt = Date.now();
      const row = { model, locale, situation };
      try {
        const answer = await ask(model, prompt);
        row.ms = Date.now() - startedAt;
        row.finish = answer.finish;
        row.promptTokens = answer.promptTokens;
        row.completionTokens = answer.completionTokens;
        const parsed = JSON.parse(answer.text);
        row.advice = parsed.advice;
        row.nextStep = parsed.nextStep;
        const share = arabicShare(`${parsed.advice} ${parsed.nextStep}`);
        row.languageOk = locale === 'ar' ? share > 0.6 : share < 0.1;
        console.log(
          `${locale} ${situation.padEnd(16)} ${String(row.ms).padStart(6)} ms  tokens ${row.promptTokens}+${row.completionTokens}  language ${row.languageOk ? 'ok ' : 'NO '}  ${parsed.advice.slice(0, 70).replace(/\n/g, ' ')}…`,
        );
      } catch (error) {
        row.ms = Date.now() - startedAt;
        row.error = error.message.slice(0, 160);
        console.log(
          `${locale} ${situation.padEnd(16)} ${String(row.ms).padStart(6)} ms  FAILED: ${row.error}`,
        );
      }
      results.push(row);
      await sleep(1500);
    }
  }
}
writeFileSync(outFile, JSON.stringify(results, null, 2));
console.log(`\nFull answers written to ${outFile}`);
