import type { Prompt } from '../../ai/ai-provider.js';
import type { Locale } from '../../auth/locale.js';
import type { Goal } from '../../goals/dto/goal.dto.js';
import type { Profile } from '../../profile/dto/profile.dto.js';
import type { ProgressDay } from '../../progress/dto/progress.dto.js';
import type { Session } from '../../sessions/dto/session.dto.js';
import type { Situation } from '../situation.js';
import { clip, LONG_CLIP, profileDigest, SHORT_CLIP } from './digest.js';
import { languageLine, RULES } from './rules.js';
import { SITUATION_GUIDANCE, SITUATION_LABELS } from './situations.js';

/** A past struggle as the prompt needs it: what happened and what came of it. */
export interface PastStruggle {
  situation: Situation;
  description: string;
  advice: string;
  nextStep: string;
  continued: boolean | null;
  createdAt: Date;
}

export interface PromptContext {
  locale: Locale;
  profile: Profile;
  /** The open session, running or awaiting its review, if there is one. */
  session: Session | undefined;
  /**
   * With a session: that session's goal, alone. Without one: every active
   * goal. The builder shows the first case in full and the second briefly.
   */
  goals: Goal[];
  /** The last days, oldest first, today last. */
  progress: ProgressDay[];
  /** Newest first. */
  pastStruggles: PastStruggle[];
  situation: Situation;
  description: string;
}

/** A past struggle's description and advice, each. */
const PAST_CLIP = 200;
/**
 * The most the user message may hold. Groq's free tier allows 8,000 tokens a
 * minute for the whole app, and Arabic takes two to three tokens per word.
 * Past the budget, the oldest past struggles are dropped first.
 */
export const USER_MESSAGE_BUDGET = 16_000;

/**
 * The prompt for one struggle. The system message is the rules, the
 * language, and the guidance for this situation. The user message is the
 * person's data in a fixed order, from who they are to what is happening
 * now; the description comes last, so the model reads it with everything
 * else already in mind.
 */
export function buildPrompt(context: PromptContext): Prompt {
  const system = [
    RULES,
    languageLine(context.locale),
    `## This situation: ${SITUATION_LABELS[context.situation]}\n${SITUATION_GUIDANCE[context.situation]}`,
  ].join('\n\n');

  let pastStruggles = context.pastStruggles;
  let user = userMessage(context, pastStruggles);
  while (user.length > USER_MESSAGE_BUDGET && pastStruggles.length > 0) {
    pastStruggles = pastStruggles.slice(0, -1);
    user = userMessage(context, pastStruggles);
  }
  return { system, user };
}

function userMessage(
  context: PromptContext,
  pastStruggles: PastStruggle[],
): string {
  return [
    `## About the person\n${profileDigest(context.profile).join('\n')}`,
    goalSection(context),
    workingOnSection(context.session),
    `## Last ${String(context.progress.length)} days (oldest first, today last)\n${progressLines(context.progress)}`,
    `## Past struggles (newest first)\n${pastStrugglesLines(pastStruggles)}`,
    `## Now\nSituation: ${SITUATION_LABELS[context.situation]}\nIn their words: ${clip(context.description, LONG_CLIP * 2)}`,
  ].join('\n\n');
}

function goalSection(context: PromptContext): string {
  if (context.session !== undefined) {
    const goal = context.goals.find((g) => g.id === context.session?.goal.id);
    if (goal === undefined) {
      return `## Goal\nTitle: ${clip(context.session.goal.title, SHORT_CLIP)}`;
    }
    return [
      '## Goal',
      `Title: ${clip(goal.title, SHORT_CLIP)}`,
      `Why it matters: ${clip(goal.whyItMatters, LONG_CLIP)}`,
      goal.obstacle === null
        ? null
        : `What stands in the way: ${clip(goal.obstacle, LONG_CLIP)}`,
      goal.firstOutcome === null
        ? null
        : `First outcome wanted: ${clip(goal.firstOutcome, LONG_CLIP)}`,
    ]
      .filter((part) => part !== null)
      .join('\n');
  }
  if (context.goals.length === 0) {
    return '## Goals\nNo active goal yet.';
  }
  return `## Goals\n${context.goals
    .map(
      (goal) =>
        `- ${clip(goal.title, SHORT_CLIP)} — why it matters: ${clip(goal.whyItMatters, SHORT_CLIP)}`,
    )
    .join('\n')}`;
}

function workingOnSection(session: Session | undefined): string {
  if (session === undefined) {
    return '## Working on now\nNo focus session is open right now.';
  }
  const state =
    session.endedAt === null ? 'running' : 'stopped, review still to come';
  return `## Working on now\nA focus session (${state}) on the step "${clip(session.step.title, SHORT_CLIP)}", in the task "${clip(session.task.title, SHORT_CLIP)}" of the goal "${clip(session.goal.title, SHORT_CLIP)}".`;
}

function progressLines(days: ProgressDay[]): string {
  if (days.length === 0) {
    return 'Nothing recorded yet.';
  }
  return days
    .map(
      (day) =>
        `- ${day.date}: ${String(day.focusMinutes)} focus minutes, ${String(day.stepsDone)} steps done, struggled and continued ${String(day.struggledAndContinued)} times`,
    )
    .join('\n');
}

function pastStrugglesLines(struggles: PastStruggle[]): string {
  if (struggles.length === 0) {
    return 'None yet.';
  }
  return struggles
    .map((s) => {
      const outcome =
        s.continued === null
          ? 'not said yet'
          : s.continued
            ? 'continued'
            : 'stopped';
      return `- ${s.createdAt.toISOString().slice(0, 10)}, ${SITUATION_LABELS[s.situation]}: "${clip(s.description, PAST_CLIP)}". Advice given: "${clip(s.advice, PAST_CLIP)}". Next step given: "${clip(s.nextStep, PAST_CLIP)}". Afterwards: ${outcome}.`;
    })
    .join('\n');
}
