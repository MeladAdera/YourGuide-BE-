import type { Goal } from '../goals/dto/goal.dto.js';
import type { Step } from '../steps/dto/step.dto.js';
import type { Task } from '../tasks/dto/task.dto.js';
import { buildBreakdownPrompt } from './breakdown-prompt.js';

const AT = new Date('2026-10-01T10:00:00.000Z');
const GOAL = {
  id: 'goal-1',
  title: 'Ship my first product',
  whyItMatters: 'To prove to myself I can finish something of my own.',
  obstacle: 'Evenings disappear into my phone.',
  firstOutcome: null,
  createdAt: AT,
  archivedAt: null,
} satisfies Goal;
const TASK = {
  id: 'task-1',
  goalId: 'goal-1',
  title: 'Learn PostgreSQL',
  status: 'in_progress',
  createdAt: AT,
} satisfies Task;
const STEPS = [
  {
    id: 's1',
    taskId: 'task-1',
    title: 'Install PostgreSQL',
    doneAt: AT,
    createdAt: AT,
  },
  {
    id: 's2',
    taskId: 'task-1',
    title: 'Understand SELECT',
    doneAt: null,
    createdAt: AT,
  },
] satisfies Step[];

describe('buildBreakdownPrompt', () => {
  it('tells the model the rules, the goal and its why, the task, and the steps so far', () => {
    const { system, user } = buildBreakdownPrompt({
      locale: 'en',
      goal: GOAL,
      task: TASK,
      steps: STEPS,
    });

    expect(system).toContain('between 3 and 7 steps');
    expect(system).toContain('Write the steps in English');
    expect(user).toContain('Title: Ship my first product');
    expect(user).toContain('Why it matters: To prove to myself');
    expect(user).toContain('What stands in the way: Evenings');
    expect(user).not.toContain('First outcome wanted');
    expect(user).toContain('## Task\nLearn PostgreSQL');
    expect(user).toContain('- Install PostgreSQL (done)\n- Understand SELECT');
    expect(user.trimEnd()).toMatch(
      /Language: write every step in English, whatever language the text above is in\.$/,
    );
  });

  it('says so when the task has no steps yet', () => {
    const { user } = buildBreakdownPrompt({
      locale: 'en',
      goal: GOAL,
      task: TASK,
      steps: [],
    });

    expect(user).toContain(
      '## Steps the task already has, in order\nNone yet.',
    );
  });

  it('follows the language of the task title, not of the account', () => {
    const arabicTask = { ...TASK, title: 'تعلم PostgreSQL' };
    const { system, user } = buildBreakdownPrompt({
      locale: 'en',
      goal: GOAL,
      task: arabicTask,
      steps: [],
    });

    expect(system).toContain('Write the steps in Arabic');
    expect(user.trimEnd()).toMatch(
      /in Arabic, whatever language the text above is in\.$/,
    );
  });

  it('falls back to the account language when the title does not say', () => {
    const numbers = { ...TASK, title: '2024-Q4' };
    const { system } = buildBreakdownPrompt({
      locale: 'ar',
      goal: GOAL,
      task: numbers,
      steps: [],
    });

    expect(system).toContain('Write the steps in Arabic');
  });
});
