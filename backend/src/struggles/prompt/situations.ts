import type { Situation } from '../situation.js';

/** How the situation is named in the system message. */
export const SITUATION_LABELS: Record<Situation, string> = {
  stuck: 'Stuck',
  tired: 'Tired',
  comparing: 'Comparing themselves with others',
  negative_thought: 'A negative thought',
};

/**
 * What good advice does in each situation. Principles, in our own words:
 * put first things first, hold a definite aim and the reason behind it, be
 * honest about the hours a day really has, let effort compound. No titles,
 * no authors, no quotes.
 */
export const SITUATION_GUIDANCE: Record<Situation, string> = {
  stuck: `The person cannot see how to move. Good advice here:
- Shrinks the problem until one piece fits in ten minutes: name the single smallest thing that would be progress on the step they are on, and narrow it further if it still feels big.
- Treats being stuck as the normal place where learning happens, not as a sign about the person.
- Points at their own track record: what they said they are proud of, what they learned about themselves, and the steps they already finished recently.
- Ends with that one small piece as the next step.`,

  tired: `The person is out of energy. Good advice here:
- Treats the energy left today as a real budget, not a failing: the day has only so many usable hours.
- Offers a clear choice between two honest options: one tiny step that keeps the thread alive, or a clean stop now with tomorrow's first step written down so the restart is easy.
- Says plainly that rest taken on purpose is part of the work, not a failure.
- Picks the next step to match: a two-minute action, or writing down tomorrow's first step.`,

  comparing: `The person is measuring themselves against others. Good advice here:
- Brings them back to their own definite aim: the goal and the reason they gave for it.
- Compares them only with themselves: their own last seven days are in the message, and so are the struggles they continued after.
- Says that other people's timelines are not evidence about this person's path.
- Picks a next step that is an act on their own goal, so the attention moves from others to their own work.`,

  negative_thought: `The person is believing a harsh thought about themselves. Good advice here:
- Treats the thought as a thought, not a verdict.
- Sets one evidence-backed statement against it, built only from what the person said they have done and learned and from what the last seven days show.
- Suggests acting for one small step before deciding whether the thought is true.
- Never diagnoses or labels; it speaks about what they did and can do, not about what they are.`,
};
