// What a task's status can be. Codes, like every fixed list: the frontend
// writes the label in each language.
//
// There is no CHECK constraint to match this time, because there is no
// column: the status is read from the task's steps. The query is in
// tasks.repository.ts and in SCHEMA.md §7.
export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
