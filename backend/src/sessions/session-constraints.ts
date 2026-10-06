/**
 * The foreign key from sessions to steps. It has no ON DELETE action, so
 * PostgreSQL refuses to delete a step that has sessions, and with it the
 * task or goal whose delete would cascade down to that step. Work history
 * is never deleted by accident; the API turns the refusal into 409.
 *
 * Must match the constraint name in SCHEMA.md §9.
 */
export const SESSION_STEP_FK = 'sessions_step_id_fkey';

/**
 * The unique index behind "one running session per user". It covers only
 * the rows where ended_at is NULL, so a user can have any number of ended
 * sessions and one that is running. PostgreSQL refuses a second running
 * one; the API turns the refusal into 409.
 *
 * Must match the index name in SCHEMA.md §9.
 */
export const ONE_ACTIVE_SESSION = 'one_active_session_per_user';
