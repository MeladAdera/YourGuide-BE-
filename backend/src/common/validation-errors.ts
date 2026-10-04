import { ApiProperty } from '@nestjs/swagger';
import type { ValidationError } from 'class-validator';
import { ApiError } from './api-error.js';

/** One broken rule: which field, which rule, and the sentence for it. */
export interface BrokenRule {
  /** The path to the field, e.g. `password` or `values.0.note`. */
  field: string;
  /** The name of the rule, as class-validator names it, e.g. `minLength`. */
  code: string;
  /** class-validator's English sentence. */
  message: string;
}

/**
 * Turns class-validator's errors into a flat list of broken rules. The
 * errors arrive as a tree: a field inside a list sits under the list and
 * under its position, so the path is built on the way down.
 */
export function brokenRules(
  errors: ValidationError[],
  parent = '',
): BrokenRule[] {
  return errors.flatMap((error) => {
    const field =
      parent === '' ? error.property : `${parent}.${error.property}`;
    const own = Object.entries(error.constraints ?? {}).map(
      ([code, message]) => ({
        field,
        code,
        // class-validator names only the last part ("note must be shorter
        // than…"). The path in front says which note.
        message: parent === '' ? message : `${parent}.${message}`,
      }),
    );
    return [...own, ...brokenRules(error.children ?? [], field)];
  });
}

/**
 * What the ValidationPipe throws when a DTO refuses a body or a query.
 * `message` is the list of English sentences, as before. `errors` says the
 * same thing in codes, so the frontend can write its own sentence, in the
 * user's language, under the right input.
 */
export function validationFailed(errors: ValidationError[]): ApiError {
  const rules = brokenRules(errors);
  return new ApiError('validation.failed', {
    message: rules.map((rule) => rule.message),
    errors: rules.map(({ field, code }) => ({ field, code })),
  });
}

/** One entry of `errors`, as Swagger describes it. */
export class FieldError {
  @ApiProperty({
    example: 'values.0.note',
    description:
      'The field. Inside a list: the list, the position (from 0), the field.',
  })
  field!: string;

  @ApiProperty({
    example: 'maxLength',
    description:
      'The rule that was broken, e.g. `minLength`, `isEmail`, `isIn`, `arrayUnique`. `whitelistValidation` means the field is not known.',
  })
  code!: string;
}

/** The body of a 400 from a DTO, as Swagger describes it. */
export class ValidationErrorBody {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'Bad Request' })
  error!: string;

  @ApiProperty({ example: 'validation.failed' })
  code!: string;

  @ApiProperty({
    type: [String],
    example: ['values.0.note must be shorter than or equal to 300 characters'],
    description: 'English, for developers. One sentence per broken rule.',
  })
  message!: string[];

  @ApiProperty({
    type: [FieldError],
    description:
      'One entry per broken rule, in the same order as `message`. A client translates from these.',
  })
  errors!: FieldError[];
}
