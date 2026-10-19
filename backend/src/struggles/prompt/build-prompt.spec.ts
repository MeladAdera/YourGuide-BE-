import type { Goal } from '../../goals/dto/goal.dto.js';
import type { Profile } from '../../profile/dto/profile.dto.js';
import type { Session } from '../../sessions/dto/session.dto.js';
import { SITUATIONS } from '../situation.js';
import {
  buildPrompt,
  PastStruggle,
  PromptContext,
  USER_MESSAGE_BUDGET,
} from './build-prompt.js';

const UPDATED = new Date('2026-10-01T10:00:00.000Z');

const PROFILE = {
  basics: {
    employmentStatus: 'employed',
    ageRange: '25_34',
    country: 'AE',
    educationLevel: 'bachelor',
    occupation: 'junior developer',
    yearsExperience: '2_5',
    updatedAt: UPDATED,
  },
  situation: {
    typicalDay: 'Work until six, then an hour of study, often skipped.',
    wantToChange: 'Study every evening, not only when I feel like it.',
    satisfiedWith: null,
    wishMoreTimeFor: 'Building my own project.',
    updatedAt: UPDATED,
  },
  achievements: {
    proudOf: 'Finished a six-month course while working full time.',
    whatWasHard: null,
    learnedAboutSelf: 'I keep going when I have a plan on paper.',
    updatedAt: UPDATED,
  },
  patterns: {
    oftenPostpone: 'Starting anything that needs reading first.',
    lessonFromMistake: 'Guessing instead of reading the docs costs more.',
    patternToChange: null,
    updatedAt: UPDATED,
  },
  selfView: {
    whoIAm: 'Curious, slow to start, stubborn once started.',
    goodAt: 'Explaining things.',
    othersComeToMeFor: null,
    stillFiguringOut: 'How to study without a deadline.',
    updatedAt: UPDATED,
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
    updatedAt: UPDATED,
  },
  values: {
    values: [
      { value: 'family', note: null },
      { value: 'learning', note: 'the thing I never regret' },
    ],
    personToBecome: 'Someone who finishes what they start.',
    wouldRegretNotDoing: null,
    rememberedFor: 'Being reliable.',
    updatedAt: UPDATED,
  },
} satisfies Profile;

const GOAL = {
  id: 'goal-1',
  title: 'Ship my first product',
  whyItMatters: 'To prove to myself I can finish something of my own.',
  obstacle: 'Evenings disappear into my phone.',
  firstOutcome: 'A landing page that one stranger signs up on.',
  createdAt: UPDATED,
  archivedAt: null,
} satisfies Goal;

const SESSION = {
  id: 'session-1',
  startedAt: new Date('2026-10-17T18:00:00.000Z'),
  endedAt: null,
  step: { id: 'step-1', title: 'Understand SELECT' },
  task: { id: 'task-1', title: 'Learn PostgreSQL' },
  goal: { id: 'goal-1', title: 'Ship my first product' },
} satisfies Session;

const PAST_TIRED: PastStruggle = {
  situation: 'tired',
  description: 'Too tired after work to open the laptop.',
  advice: "Write tomorrow's first step down and stop for today.",
  nextStep: 'Write one line: tomorrow, open the orders table.',
  continued: false,
  createdAt: new Date('2026-10-15T20:00:00.000Z'),
};
const PAST_STUCK: PastStruggle = {
  situation: 'stuck',
  description: 'JOIN makes no sense to me.',
  advice: 'Start with two tables and one matching column.',
  nextStep: 'Join orders to customers on customer_id.',
  continued: true,
  createdAt: new Date('2026-10-12T20:00:00.000Z'),
};
const PAST: PastStruggle[] = [PAST_TIRED, PAST_STUCK];

const PHRASES = {
  stuck: 'Stuck',
  tired: 'Tired',
  comparing: 'Comparing themselves with others',
  negative_thought: 'A negative thought',
} as const;

function context(overrides: Partial<PromptContext> = {}): PromptContext {
  return {
    locale: 'en',
    profile: PROFILE,
    session: SESSION,
    goals: [GOAL],
    progress: [
      {
        date: '2026-10-16',
        focusMinutes: 0,
        stepsDone: 0,
        struggledAndContinued: 0,
      },
      {
        date: '2026-10-17',
        focusMinutes: 50,
        stepsDone: 2,
        struggledAndContinued: 1,
      },
    ],
    pastStruggles: PAST,
    situation: 'stuck',
    description:
      'I have read about JOIN three times and still cannot write one.',
    ...overrides,
  };
}

function section(user: string, heading: string): string {
  const start = user.indexOf(`## ${heading}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = user.indexOf('\n## ', start + 1);
  return user.slice(start, next === -1 ? undefined : next);
}

describe('buildPrompt', () => {
  it("puts the rules, the language and this situation's guidance in the system message", () => {
    const { system } = buildPrompt(context());

    expect(system).toContain('Never diagnose');
    expect(system).toContain('Write both fields in English.');
    expect(system).toContain('## This situation: Stuck');
    expect(system).toContain('fits in ten minutes');
    expect(system).not.toContain('energy left today');
  });

  it.each([
    ['stuck', 'Stuck', 'fits in ten minutes'],
    ['tired', 'Tired', 'energy left today'],
    ['comparing', 'Comparing themselves with others', 'definite aim'],
    ['negative_thought', 'A negative thought', 'not a verdict'],
  ] as const)(
    'carries the guidance for %s and no other situation',
    (situation, label, phrase) => {
      const { system, user } = buildPrompt(context({ situation }));

      expect(system).toContain(`## This situation: ${label}`);
      expect(system).toContain(phrase);
      for (const other of SITUATIONS.filter((s) => s !== situation)) {
        expect(system).not.toContain(`## This situation: ${PHRASES[other]}`);
      }
      expect(user).toContain(`Situation: ${label}`);
    },
  );

  it("asks for Arabic without assuming the reader's gender", () => {
    const { system } = buildPrompt(context({ locale: 'ar' }));

    expect(system).toContain('Write both fields in Arabic.');
    expect(system).toContain('man or a woman');
    expect(system).not.toContain('Write both fields in English.');
    expect(buildPrompt(context({ locale: 'ar' })).user.trimEnd()).toMatch(
      /Language: write both "advice" and "nextStep" in Arabic, whatever language the text above is in\.$/,
    );
  });

  it('orders the user message from the person to the struggle, which comes last', () => {
    const { user } = buildPrompt(context());

    const headings = [
      '## About the person',
      '## Goal',
      '## Working on now',
      '## Last 2 days',
      '## Past struggles',
      '## Now',
    ];
    const positions = headings.map((h) => user.indexOf(h));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(user.trimEnd()).toMatch(
      /still cannot write one\.\n\nLanguage: write both "advice" and "nextStep" in English, whatever language the text above is in\.$/,
    );
  });

  it('with a session, shows its goal in full and what is being worked on', () => {
    const { user } = buildPrompt(context());

    expect(section(user, 'Goal')).toContain(
      'Why it matters: To prove to myself',
    );
    expect(section(user, 'Goal')).toContain('What stands in the way: Evenings');
    expect(section(user, 'Goal')).toContain(
      'First outcome wanted: A landing page',
    );
    expect(section(user, 'Working on now')).toContain('(running)');
    expect(section(user, 'Working on now')).toContain('"Understand SELECT"');
    expect(section(user, 'Working on now')).toContain('"Learn PostgreSQL"');
  });

  it('says when the clock is stopped and the review still to come', () => {
    const { user } = buildPrompt(
      context({ session: { ...SESSION, endedAt: new Date() } }),
    );

    expect(section(user, 'Working on now')).toContain(
      'stopped, review still to come',
    );
  });

  it('without a session, lists every active goal briefly', () => {
    const second: Goal = {
      ...GOAL,
      id: 'goal-2',
      title: 'Run 5 km',
      whyItMatters: 'To feel strong again.',
    };
    const { user } = buildPrompt(
      context({ session: undefined, goals: [GOAL, second] }),
    );

    const goals = section(user, 'Goals');
    expect(goals).toContain(
      '- Ship my first product — why it matters: To prove',
    );
    expect(goals).toContain(
      '- Run 5 km — why it matters: To feel strong again.',
    );
    expect(goals).not.toContain('What stands in the way');
    expect(section(user, 'Working on now')).toContain(
      'No focus session is open',
    );
  });

  it('says so when there is no active goal', () => {
    const { user } = buildPrompt(context({ session: undefined, goals: [] }));

    expect(section(user, 'Goals')).toContain('No active goal yet.');
  });

  it('turns the confidence answers into statements, never numbers or scores', () => {
    const { user } = buildPrompt(context());
    const about = section(user, 'About the person');
    const says = about
      .split('\n')
      .find((l) => l.startsWith('- Says of themselves'));

    expect(says).toBeDefined();
    expect(says).not.toMatch(/\d/);
    expect(says).toContain(
      'believes they can learn difficult things by keeping at them',
    );
    expect(says).toContain(
      'is unsure whether they can try again after a failure',
    );
    expect(says).toContain('often does not follow through');
    expect(says).toContain('says they compare themselves with others a lot');
    expect(about.toLowerCase()).not.toMatch(
      /score|level|low self|anxiety|depress/,
    );
  });

  it('renders the basics as words and the values with their notes', () => {
    const { user } = buildPrompt(context());
    const about = section(user, 'About the person');

    expect(about).toContain(
      "- Life: employed, 25 to 34, a bachelor's degree, 2 to 5 years of experience, in AE, works as junior developer.",
    );
    expect(about).toContain(
      'Values most: family, learning (the thing I never regret)',
    );
    expect(about).toContain('Wants to be remembered for: Being reliable.');
  });

  it('leaves out an unsaved screen and the answers left empty, and never writes null', () => {
    const { user } = buildPrompt(
      context({ profile: { ...PROFILE, basics: null } }),
    );
    const about = section(user, 'About the person');

    expect(about).not.toContain('- Life:');
    expect(about).not.toContain('Satisfied with');
    expect(about).not.toContain('What was hard about it');
    expect(about).not.toContain('null');
    expect(about).toContain('Wishes more time for: Building my own project.');
  });

  it('clips long answers to one line with an ellipsis', () => {
    const long = `${'word '.repeat(300)}END`;
    const { user } = buildPrompt(
      context({
        profile: {
          ...PROFILE,
          situation: { ...PROFILE.situation, typicalDay: long },
        },
      }),
    );
    const about = section(user, 'About the person');

    expect(about).not.toContain('END');
    expect(about).toMatch(/A typical day: (word ){50,}[^\n]*…/);
  });

  it('writes the progress oldest first and each past struggle with what came of it', () => {
    const { user } = buildPrompt(context());

    expect(section(user, 'Last 2 days')).toContain(
      '- 2026-10-16: 0 focus minutes, 0 steps done, struggled and continued 0 times\n- 2026-10-17: 50 focus minutes, 2 steps done, struggled and continued 1 times',
    );
    const past = section(user, 'Past struggles');
    expect(past).toContain('2026-10-15, Tired: "Too tired after work');
    expect(past).toContain('Afterwards: stopped.');
    expect(past).toContain('2026-10-12, Stuck: "JOIN makes no sense');
    expect(past).toContain('Afterwards: continued.');
  });

  it('says "not said yet" for a struggle without an answer, and "None yet." with none', () => {
    const unanswered = buildPrompt(
      context({ pastStruggles: [{ ...PAST_TIRED, continued: null }] }),
    );
    expect(section(unanswered.user, 'Past struggles')).toContain(
      'Afterwards: not said yet.',
    );

    const none = buildPrompt(context({ pastStruggles: [] }));
    expect(section(none.user, 'Past struggles')).toContain('None yet.');
  });

  it('drops the oldest past struggles once the message passes the budget', () => {
    const many: PastStruggle[] = Array.from({ length: 120 }, (_, i) => ({
      ...PAST_STUCK,
      description: `struggle number ${String(i)} ${'x'.repeat(190)}`,
      createdAt: new Date(Date.UTC(2026, 0, 1 + (119 - i))),
    }));
    const { user } = buildPrompt(context({ pastStruggles: many }));

    expect(user.length).toBeLessThanOrEqual(USER_MESSAGE_BUDGET);
    expect(user).toContain('struggle number 0 ');
    expect(user).not.toContain('struggle number 119 ');
    expect(user).toContain('## Now');
  });
});
