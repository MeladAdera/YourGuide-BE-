import { ApiError } from '../common/api-error.js';
import { Goal } from './dto/goal.dto.js';

/**
 * The two questions before every write under a goal, in this order: is it
 * yours (404), and is it active (409)? 404 first, so that someone else's
 * archived goal answers exactly like one that does not exist.
 *
 * An archived goal is read-only: nothing under it is added, changed or
 * deleted until it is unarchived (DECISIONS.md, 2026-10-05). Tasks and
 * steps both ask here, so the rule has one home.
 *
 * `goal` comes from one of the `findLocked…` reads of GoalsRepository,
 * inside the transaction that then writes. `missing` is what the caller
 * asked for by id: the goal when adding a task, the task when adding a
 * step, the task or step itself when changing one.
 */
export function requireActive(
  goal: Goal | undefined,
  missing: 'goal.not_found' | 'task.not_found' | 'step.not_found',
): void {
  if (goal === undefined) {
    throw new ApiError(missing);
  }
  if (goal.archivedAt !== null) {
    throw new ApiError('goal.archived');
  }
}
