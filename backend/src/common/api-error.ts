import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Every error the API answers with on purpose, by code. The code is the
 * stable name of the error: the frontend translates by it, into English or
 * Arabic. The sentence is for Swagger and for a developer reading a
 * response; no client should match on it, so it can be reworded freely.
 *
 * A new error in any module is a new line here.
 */
export const API_ERRORS = {
  'auth.not_logged_in': {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Not logged in.',
  },
  'auth.invalid_credentials': {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Invalid email or password.',
  },
  'auth.email_taken': {
    status: HttpStatus.CONFLICT,
    message: 'An account with this email already exists.',
  },
  'profile.onboarding_not_done': {
    status: HttpStatus.NOT_FOUND,
    message: 'Onboarding is not done yet.',
  },
  'profile.screen_not_saved': {
    status: HttpStatus.NOT_FOUND,
    message: 'This screen is not saved yet.',
  },
  'goal.onboarding_required': {
    status: HttpStatus.CONFLICT,
    message: 'Finish these screens first.',
  },
  'goal.not_found': {
    status: HttpStatus.NOT_FOUND,
    message: 'Goal not found.',
  },
  'goal.has_work_history': {
    status: HttpStatus.CONFLICT,
    message: 'This has work history. Archive the goal instead.',
  },
  'goal.archived': {
    status: HttpStatus.CONFLICT,
    message: 'This goal is archived. Unarchive it first.',
  },
  'goal.session_running': {
    status: HttpStatus.CONFLICT,
    message: 'A focus session is running under this goal. End it first.',
  },
  'task.not_found': {
    status: HttpStatus.NOT_FOUND,
    message: 'Task not found.',
  },
  'task.has_work_history': {
    status: HttpStatus.CONFLICT,
    message: 'This task has work history. It cannot be deleted.',
  },
  'step.not_found': {
    status: HttpStatus.NOT_FOUND,
    message: 'Step not found.',
  },
  'step.has_work_history': {
    status: HttpStatus.CONFLICT,
    message: 'This step has work history. It cannot be deleted.',
  },
  'step.order_mismatch': {
    status: HttpStatus.BAD_REQUEST,
    message: 'The list must hold every step of this task, each once.',
  },
  'session.already_active': {
    status: HttpStatus.CONFLICT,
    message: 'A focus session is already running. End it first.',
  },
  'session.none_active': {
    status: HttpStatus.NOT_FOUND,
    message: 'No focus session is running.',
  },
  'session.step_done': {
    status: HttpStatus.CONFLICT,
    message: 'This step is done. Mark it not done to work on it again.',
  },

  // A body or a query refused by a DTO. The answer carries the sentences
  // of the broken rules as `message`, and the rules themselves, by field,
  // as `errors` (see validation-errors.ts).
  'validation.failed': {
    status: HttpStatus.BAD_REQUEST,
    message: 'Some fields are not valid.',
  },

  // The three below have no feature in their name. They are the codes for
  // errors NestJS throws by itself (ErrorCodeFilter picks one by status),
  // and NestJS's own sentence is kept in the answer.
  bad_request: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The request is not valid.',
  },
  not_found: {
    status: HttpStatus.NOT_FOUND,
    message: 'Not found.',
  },
  rate_limited: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: 'Too many attempts. Try again in a minute.',
  },
} as const satisfies Record<string, { status: HttpStatus; message: string }>;

export type ApiErrorCode = keyof typeof API_ERRORS;

/**
 * An error from the list above: `throw new ApiError('goal.not_found')`.
 * The status and the sentence come from the list, so a code can never be
 * sent with the wrong status. `extra` adds fields to the answer, such as
 * the `missing` screens; a `message` in it replaces the sentence from the
 * list, which is how a validation error lists its own sentences.
 */
export class ApiError extends HttpException {
  constructor(code: ApiErrorCode, extra: Record<string, unknown> = {}) {
    const { status, message } = API_ERRORS[code];
    super({ code, message, ...extra }, status);
  }
}

/** The body of an error answer, as Swagger describes it. */
export class ApiErrorBody {
  @ApiProperty({ example: 404 })
  statusCode!: number;

  @ApiProperty({ example: 'Not Found' })
  error!: string;

  @ApiProperty({
    enum: Object.keys(API_ERRORS),
    example: 'goal.not_found',
    description:
      'The stable name of the error. A client translates by it, never by `message`.',
  })
  code!: string;

  @ApiProperty({
    example: 'Goal not found.',
    description: 'English, for developers. It can be reworded at any time.',
  })
  message!: string;
}
