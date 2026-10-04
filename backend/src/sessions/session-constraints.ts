/**
 * The foreign key from sessions to steps. It has no ON DELETE action, so
 * PostgreSQL refuses to delete a step that has sessions, and with it the
 * task or goal whose delete would cascade down to that step. Work history
 * is never deleted by accident; the API turns the refusal into 409.
 *
 * Must match the constraint name in SCHEMA.md §9.
 */
export const SESSION_STEP_FK = 'sessions_step_id_fkey';
