import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request, { Response } from 'supertest';
import { App } from 'supertest/types.js';
import { DatabaseService } from '../src/database/database.service.js';
import { createTestApp } from './helpers/create-test-app.js';
import { resetRateLimits } from './helpers/reset-rate-limit.js';
import { saveRequiredScreens } from './helpers/save-required-screens.js';
import { cookieHeader, sessionToken } from './helpers/session-cookie.js';

// Dubai is UTC+4 all year: no daylight saving to surprise a test.
const TIMEZONE = 'Asia/Dubai';
const USER = {
  email: 'melad@example.com',
  password: 'correct horse battery',
  timezone: TIMEZONE,
  locale: 'en',
};
const GOAL = {
  title: 'Become a stronger full-stack developer',
  whyItMatters: 'I want to build my own products.',
};
const TASK = { title: 'Learn PostgreSQL' };
const STEP = { title: 'Understand SELECT' };
const ZERO = { focusMinutes: 0, stepsDone: 0, struggledAndContinued: 0 };

interface Day {
  date: string;
  focusMinutes: number;
  stepsDone: number;
  struggledAndContinued: number;
}

interface ProgressBody {
  days: Day[];
  totals: {
    focusMinutes: number;
    stepsDone: number;
    struggledAndContinued: number;
  };
}

interface Plan {
  goalId: string;
  taskId: string;
  stepId: string;
}

type Method = 'get' | 'post' | 'patch' | 'delete';

/** Today in a timezone, as YYYY-MM-DD (the en-CA format is exactly that). */
function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** The date some days before a date, as YYYY-MM-DD. */
function daysBefore(date: string, days: number): string {
  const time = new Date(`${date}T00:00:00Z`).getTime() - days * 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}

/** A moment of a Dubai day, as an instant PostgreSQL reads. */
function dubai(date: string, time: string): string {
  return `${date}T${time}+04:00`;
}

describe('/api/progress', () => {
  let app: INestApplication<App>;
  let pool: Pool;
  let cookie: string;
  let userId: string;
  let goalId: string;
  let taskId: string;
  let stepId: string;
  let today: string;
  let yesterday: string;

  async function register(
    email: string,
    timezone = TIMEZONE,
  ): Promise<{ cookie: string; userId: string }> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ ...USER, email, timezone });
    return {
      cookie: cookieHeader(sessionToken(response)),
      userId: (response.body as { id: string }).id,
    };
  }

  /** One call to /api<path>. `as: null` sends no cookie at all. */
  function call(
    method: Method,
    path: string,
    options: { body?: object; as?: string | null } = {},
  ): Promise<Response> {
    let req = request(app.getHttpServer())[method](`/api${path}`);
    const as = options.as === undefined ? cookie : options.as;
    if (as !== null) {
      req = req.set('Cookie', as);
    }
    return options.body === undefined ? req : req.send(options.body);
  }

  async function created(
    path: string,
    body: object,
    as: string,
  ): Promise<string> {
    const response = await call('post', path, { body, as });
    return (response.body as { id: string }).id;
  }

  /** A goal with one task that has one step, made through the API. */
  async function plan(as = cookie): Promise<Plan> {
    const goal = await created('/goals', GOAL, as);
    const task = await created(`/goals/${goal}/tasks`, TASK, as);
    const step = await created(`/tasks/${task}/steps`, STEP, as);
    return { goalId: goal, taskId: task, stepId: step };
  }

  function progress(query = '', as: string | null = cookie): Promise<Response> {
    return call('get', `/progress${query}`, { as });
  }

  async function body(query = '', as = cookie): Promise<ProgressBody> {
    return (await progress(query, as)).body as ProgressBody;
  }

  /** The entry of one day, or zeros when the day is not in the answer. */
  function on(answer: ProgressBody, date: string): Omit<Day, 'date'> {
    const day = answer.days.find((item) => item.date === date);
    return day === undefined
      ? ZERO
      : {
          focusMinutes: day.focusMinutes,
          stepsDone: day.stepsDone,
          struggledAndContinued: day.struggledAndContinued,
        };
  }

  /**
   * A focus session written straight into the table, so its times can be
   * chosen. Completed unless said otherwise: a running session has no end
   * and no review, a stopped one has an end and no review yet.
   */
  async function addSession(options: {
    startedAt: string;
    seconds?: number;
    state?: 'completed' | 'stopped' | 'running';
    user?: string;
    step?: string;
  }): Promise<void> {
    const state = options.state ?? 'completed';
    const endedAt =
      state === 'running'
        ? null
        : new Date(
            new Date(options.startedAt).getTime() +
              (options.seconds ?? 0) * 1000,
          ).toISOString();
    await pool.query(
      `INSERT INTO sessions
         (user_id, step_id, started_at, ended_at, outcome, rating)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        options.user ?? userId,
        options.step ?? stepId,
        options.startedAt,
        endedAt,
        state === 'completed' ? 'progress' : null,
        state === 'completed' ? 3 : null,
      ],
    );
  }

  /** Marks a step done at a chosen time. */
  async function markDone(step: string, at: string): Promise<void> {
    await pool.query('UPDATE steps SET done_at = $2 WHERE id = $1', [step, at]);
  }

  /** A struggle written straight into the table: its API comes in week 6. */
  async function addStruggle(options: {
    at: string;
    continued: boolean | null;
    user?: string;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO struggles
         (user_id, situation, description, advice, next_step, continued, created_at)
       VALUES ($1, 'stuck', 'd', 'a', 'n', $2, $3)`,
      [options.user ?? userId, options.continued, options.at],
    );
  }

  beforeAll(async () => {
    app = await createTestApp();
    pool = app.get(DatabaseService).pool;
  });

  afterAll(async () => {
    await app.close();
  });

  // Every test starts with one logged-in Dubai user who has finished
  // onboarding and has one active goal, with one task, with one step. No
  // session, no struggle, nothing done yet.
  beforeEach(async () => {
    resetRateLimits(app);
    ({ cookie, userId } = await register(USER.email));
    await saveRequiredScreens(app, cookie);
    ({ goalId, taskId, stepId } = await plan());
    today = todayIn(TIMEZONE);
    yesterday = daysBefore(today, 1);
  });

  it('answers seven days of zeros, oldest first, today last', async () => {
    const response = await progress();

    expect(response.status).toBe(200);
    const answer = response.body as ProgressBody;
    expect(answer.days.map((day) => day.date)).toEqual(
      [6, 5, 4, 3, 2, 1, 0].map((days) => daysBefore(today, days)),
    );
    for (const day of answer.days) {
      expect(day).toEqual({ date: day.date, ...ZERO });
    }
    expect(answer.totals).toEqual(ZERO);
  });

  it('counts a session at 01:30 in Dubai on the Dubai day, not the UTC day', async () => {
    // 01:30 in Dubai is 21:30 the day before in UTC.
    await addSession({ startedAt: dubai(today, '01:30:00'), seconds: 25 * 60 });

    const answer = await body();

    expect(on(answer, today).focusMinutes).toBe(25);
    expect(on(answer, yesterday).focusMinutes).toBe(0);
    expect(answer.totals.focusMinutes).toBe(25);
  });

  it('puts the same instant on different days for users in different timezones', async () => {
    const other = await register('utc@example.com', 'UTC');
    await saveRequiredScreens(app, other.cookie);
    const theirs = await plan(other.cookie);
    const instant = dubai(today, '01:30:00');
    await addSession({ startedAt: instant, seconds: 600 });
    await addSession({
      startedAt: instant,
      seconds: 600,
      user: other.userId,
      step: theirs.stepId,
    });

    const mine = await body();
    const utc = await body('', other.cookie);

    expect(on(mine, today).focusMinutes).toBe(10);
    expect(on(utc, yesterday).focusMinutes).toBe(10);
    expect(on(utc, today).focusMinutes).toBe(0);
  });

  it('adds nothing for a session that is still running', async () => {
    await addSession({ startedAt: dubai(today, '09:00:00'), state: 'running' });

    expect(on(await body(), today)).toEqual(ZERO);
  });

  it('counts a stopped session that is awaiting its review', async () => {
    await addSession({
      startedAt: dubai(today, '09:00:00'),
      seconds: 15 * 60,
      state: 'stopped',
    });

    expect(on(await body(), today).focusMinutes).toBe(15);
  });

  it('counts a session on the day it started, all of it, across midnight', async () => {
    await addSession({
      startedAt: dubai(yesterday, '23:50:00'),
      seconds: 30 * 60,
    });

    const answer = await body();

    expect(on(answer, yesterday).focusMinutes).toBe(30);
    expect(on(answer, today).focusMinutes).toBe(0);
  });

  it('adds the seconds of a day up before rounding to minutes', async () => {
    // 10:20 and 10:50 make 21:10, so 21. Alone, 29 seconds make 0.
    await addSession({ startedAt: dubai(today, '08:00:00'), seconds: 620 });
    await addSession({ startedAt: dubai(today, '09:00:00'), seconds: 650 });
    await addSession({ startedAt: dubai(yesterday, '09:00:00'), seconds: 29 });

    const answer = await body();

    expect(on(answer, today).focusMinutes).toBe(21);
    expect(on(answer, yesterday).focusMinutes).toBe(0);
  });

  it('counts steps on the day they were marked done, and forgets one unticked', async () => {
    const second = await created(
      `/tasks/${taskId}/steps`,
      { title: 'Practice WHERE' },
      cookie,
    );
    await call('patch', `/steps/${stepId}`, { body: { done: true } });
    await markDone(second, dubai(daysBefore(today, 3), '18:00:00'));

    const before = await body();
    expect(on(before, today).stepsDone).toBe(1);
    expect(on(before, daysBefore(today, 3)).stepsDone).toBe(1);
    expect(before.totals.stepsDone).toBe(2);

    await call('patch', `/steps/${stepId}`, { body: { done: false } });

    const after = await body();
    expect(on(after, today).stepsDone).toBe(0);
    expect(after.totals.stepsDone).toBe(1);
  });

  it('counts only the struggles you continued after', async () => {
    await addStruggle({ at: dubai(today, '11:00:00'), continued: true });
    await addStruggle({ at: dubai(today, '12:00:00'), continued: false });
    await addStruggle({ at: dubai(today, '13:00:00'), continued: null });
    await addStruggle({
      at: dubai(daysBefore(today, 2), '11:00:00'),
      continued: true,
    });

    const answer = await body();

    expect(on(answer, today).struggledAndContinued).toBe(1);
    expect(on(answer, daysBefore(today, 2)).struggledAndContinued).toBe(1);
    expect(answer.totals.struggledAndContinued).toBe(2);
  });

  it('does not change when the goal is archived', async () => {
    await addSession({ startedAt: dubai(today, '09:00:00'), seconds: 40 * 60 });
    await call('patch', `/steps/${stepId}`, { body: { done: true } });
    await addStruggle({ at: dubai(today, '11:00:00'), continued: true });
    const before = await body();
    expect(before.totals).toEqual({
      focusMinutes: 40,
      stepsDone: 1,
      struggledAndContinued: 1,
    });

    const archived = await call('post', `/goals/${goalId}/archive`);

    expect(archived.status).toBe(200);
    expect(await body()).toEqual(before);
  });

  it('leaves out what is older than the days asked for', async () => {
    // The eighth day back is outside a week; the seventh is its first day.
    await addSession({
      startedAt: dubai(daysBefore(today, 7), '09:00:00'),
      seconds: 50 * 60,
    });
    await addSession({
      startedAt: dubai(daysBefore(today, 6), '09:00:00'),
      seconds: 20 * 60,
    });

    const week = await body();
    const eight = await body('?days=8');

    expect(week.days[0]).toEqual({
      date: daysBefore(today, 6),
      ...ZERO,
      focusMinutes: 20,
    });
    expect(week.totals.focusMinutes).toBe(20);
    expect(eight.days).toHaveLength(8);
    expect(eight.totals.focusMinutes).toBe(70);
  });

  it('answers as many days as asked, from 1 to 90', async () => {
    const one = await body('?days=1');
    const ninety = await body('?days=90');

    expect(one.days.map((day) => day.date)).toEqual([today]);
    expect(ninety.days).toHaveLength(90);
    expect(ninety.days[0]?.date).toBe(daysBefore(today, 89));
    expect(ninety.days[89]?.date).toBe(today);
  });

  it.each(['0', '91', '7.5', 'abc', '-1', '007', ''])(
    'refuses days=%s: 400',
    async (days) => {
      const response = await progress(`?days=${days}`);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        code: 'validation.failed',
        errors: [{ field: 'days', code: 'matches' }],
      });
    },
  );

  it('refuses an unknown query field: 400', async () => {
    const response = await progress('?weeks=1');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'validation.failed',
      errors: [{ field: 'weeks', code: 'whitelistValidation' }],
    });
  });

  it("does not count another user's work", async () => {
    const other = await register('other@example.com');
    await saveRequiredScreens(app, other.cookie);
    const theirs = await plan(other.cookie);
    await addSession({
      startedAt: dubai(today, '09:00:00'),
      seconds: 30 * 60,
      user: other.userId,
      step: theirs.stepId,
    });
    await markDone(theirs.stepId, dubai(today, '09:30:00'));
    await addStruggle({
      at: dubai(today, '10:00:00'),
      continued: true,
      user: other.userId,
    });

    const mine = await body();
    const otherUsers = await body('', other.cookie);

    expect(mine.totals).toEqual(ZERO);
    expect(otherUsers.totals).toEqual({
      focusMinutes: 30,
      stepsDone: 1,
      struggledAndContinued: 1,
    });
  });

  it('needs a login', async () => {
    expect((await progress('', null)).status).toBe(401);
  });
});
