import type { Profile } from '../../profile/dto/profile.dto.js';
import type { Basics } from '../../profile/sections/basics/basics.dto.js';
import type { Confidence } from '../../profile/sections/confidence/confidence.dto.js';
import type { Values } from '../../profile/sections/values/values.dto.js';

/** One short answer from the situation and self-view screens. */
export const SHORT_CLIP = 300;
/** One answer from the achievements, patterns and values screens. */
export const LONG_CLIP = 600;

/**
 * The profile as a few lines for the model, built from the saved answers.
 * Values, strengths and patterns go in whole (clipped); the other screens
 * are one line each. A screen that is not saved, or an answer that was
 * left out, is simply absent: never "null", never "not answered".
 *
 * The confidence check-in is turned into statements in words. The number
 * never appears, and no sum or label is derived: the app never diagnoses
 * (DECISIONS.md, 2026-10-03).
 */
export function profileDigest(profile: Profile): string[] {
  const lines: string[] = [];
  if (profile.basics !== null) {
    lines.push(basicsLine(profile.basics));
  }
  if (profile.situation !== null) {
    const s = profile.situation;
    lines.push(
      line([
        ['A typical day', s.typicalDay, SHORT_CLIP],
        ['Wants to change', s.wantToChange, SHORT_CLIP],
        ['Satisfied with', s.satisfiedWith, SHORT_CLIP],
        ['Wishes more time for', s.wishMoreTimeFor, SHORT_CLIP],
      ]),
    );
  }
  if (profile.achievements !== null) {
    const a = profile.achievements;
    lines.push(
      line([
        ['Proud of', a.proudOf, LONG_CLIP],
        ['What was hard about it', a.whatWasHard, LONG_CLIP],
        ['Learned about themselves', a.learnedAboutSelf, LONG_CLIP],
      ]),
    );
  }
  if (profile.patterns !== null) {
    const p = profile.patterns;
    lines.push(
      line([
        ['Often postpones', p.oftenPostpone, LONG_CLIP],
        ['A lesson from a mistake', p.lessonFromMistake, LONG_CLIP],
        ['A pattern they want to change', p.patternToChange, LONG_CLIP],
      ]),
    );
  }
  if (profile.selfView !== null) {
    const v = profile.selfView;
    lines.push(
      line([
        ['In their own words', v.whoIAm, SHORT_CLIP],
        ['Good at', v.goodAt, SHORT_CLIP],
        ['Others come to them for', v.othersComeToMeFor, SHORT_CLIP],
        ['Still figuring out', v.stillFiguringOut, SHORT_CLIP],
      ]),
    );
  }
  if (profile.confidence !== null) {
    lines.push(
      `- Says of themselves: ${confidenceStatements(profile.confidence).join('; ')}.`,
    );
  }
  if (profile.values !== null) {
    lines.push(valuesLine(profile.values));
  }
  return lines;
}

const EMPLOYMENT: Record<Basics['employmentStatus'], string> = {
  student: 'a student',
  employed: 'employed',
  self_employed: 'self-employed',
  between_jobs: 'between jobs',
  caregiver: 'a caregiver',
  retired: 'retired',
  other: 'in another situation',
};

const AGE: Record<NonNullable<Basics['ageRange']>, string> = {
  under_18: 'under 18',
  '18_24': '18 to 24',
  '25_34': '25 to 34',
  '35_44': '35 to 44',
  '45_54': '45 to 54',
  '55_plus': '55 or older',
};

const EDUCATION: Record<NonNullable<Basics['educationLevel']>, string> = {
  secondary: 'secondary education',
  vocational: 'vocational training',
  bachelor: "a bachelor's degree",
  master: "a master's degree",
  doctorate: 'a doctorate',
  other: 'another education',
};

const EXPERIENCE: Record<NonNullable<Basics['yearsExperience']>, string> = {
  none: 'no work experience yet',
  under_2: 'under 2 years of experience',
  '2_5': '2 to 5 years of experience',
  '6_10': '6 to 10 years of experience',
  over_10: 'over 10 years of experience',
};

function basicsLine(basics: Basics): string {
  const parts = [EMPLOYMENT[basics.employmentStatus]];
  if (basics.ageRange !== null) parts.push(AGE[basics.ageRange]);
  if (basics.educationLevel !== null)
    parts.push(EDUCATION[basics.educationLevel]);
  if (basics.yearsExperience !== null)
    parts.push(EXPERIENCE[basics.yearsExperience]);
  if (basics.country !== null)
    parts.push(`in ${clip(basics.country, SHORT_CLIP)}`);
  if (basics.occupation !== null) {
    parts.push(`works as ${clip(basics.occupation, SHORT_CLIP)}`);
  }
  return `- Life: ${parts.join(', ')}.`;
}

function valuesLine(values: Values): string {
  const picks = values.values.map((pick) =>
    pick.note === null
      ? pick.value.replace('_', ' ')
      : `${pick.value.replace('_', ' ')} (${clip(pick.note, SHORT_CLIP)})`,
  );
  return line([
    ['Values most', picks.join(', '), LONG_CLIP],
    ['The person they want to become', values.personToBecome, LONG_CLIP],
    ['Would regret not doing', values.wouldRegretNotDoing, LONG_CLIP],
    ['Wants to be remembered for', values.rememberedFor, LONG_CLIP],
  ]);
}

/**
 * Each item of the check-in as a statement in words, by band: agree (4–5),
 * unsure (3), disagree (1–2). The last three items are worded the other way
 * round on the screen, so their statements name a behaviour, not a lack.
 */
const CONFIDENCE_ITEMS: {
  key: Exclude<keyof Confidence, 'updatedAt'>;
  agree: string;
  unsure: string;
  disagree: string;
}[] = [
  {
    key: 'canLearnIfPersist',
    agree: 'believes they can learn difficult things by keeping at them',
    unsure: 'is unsure whether keeping at difficult things pays off for them',
    disagree:
      'does not feel they can learn difficult things by keeping at them',
  },
  {
    key: 'canTryAgain',
    agree: 'can try again after a failure',
    unsure: 'is unsure whether they can try again after a failure',
    disagree: 'finds it hard to try again after a failure',
  },
  {
    key: 'followThrough',
    agree: 'follows through on what they start',
    unsure: 'is unsure whether they follow through on what they start',
    disagree: 'often does not follow through on what they start',
  },
  {
    key: 'focusWithoutMotivation',
    agree: 'can focus even without feeling motivated',
    unsure: 'is unsure whether they can focus without feeling motivated',
    disagree: 'finds it hard to focus without feeling motivated',
  },
  {
    key: 'actionsShapeFuture',
    agree: 'believes their own actions shape their future',
    unsure: 'is unsure whether their own actions shape their future',
    disagree: 'does not feel their own actions shape their future',
  },
  {
    key: 'doubtDespiteEvidence',
    agree: 'says they doubt themselves even when the evidence says otherwise',
    unsure: 'sometimes doubts themselves against the evidence',
    disagree: 'rarely doubts themselves against the evidence',
  },
  {
    key: 'avoidWhenAfraid',
    agree: 'says they avoid things when they are afraid',
    unsure: 'sometimes avoids things when afraid',
    disagree: 'rarely avoids things when afraid',
  },
  {
    key: 'compareTooMuch',
    agree: 'says they compare themselves with others a lot',
    unsure: 'sometimes compares themselves with others',
    disagree: 'rarely compares themselves with others',
  },
];

function confidenceStatements(confidence: Confidence): string[] {
  return CONFIDENCE_ITEMS.map((item) => {
    const answer = confidence[item.key];
    if (answer >= 4) return item.agree;
    if (answer <= 2) return item.disagree;
    return item.unsure;
  });
}

/** One bullet from labelled answers; the answers left out are skipped. */
function line(parts: [string, string | null, number][]): string {
  return `- ${parts
    .filter((part): part is [string, string, number] => part[1] !== null)
    .map(([label, text, max]) => `${label}: ${clip(text, max)}`)
    .join('. ')}.`;
}

/** One line of text, at most `max` characters, with an ellipsis when cut. */
export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
