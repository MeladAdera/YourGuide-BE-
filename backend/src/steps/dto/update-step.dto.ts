import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, ValidateIf } from 'class-validator';
import { Changed } from '../../common/answer.decorator.js';
import { MAX_STEP_TITLE } from './create-step.dto.js';

/**
 * PATCH changes only what is sent, like PATCH on a goal and a task. A step
 * has two things to change: its title, and whether it is done.
 *
 * The client says done or not done; the time is the server's. A client
 * cannot send `doneAt`, so it cannot put a step on another day of the
 * progress page.
 */
export class UpdateStepDto {
  @Changed({ example: 'Understand SELECT and WHERE', max: MAX_STEP_TITLE })
  title?: string;

  // Not @IsOptional(): that would accept `null` and silently ignore it.
  // The field may be left out; if it is sent, it must be true or false.
  @ApiPropertyOptional({
    example: true,
    description:
      '`true` marks the step done, `false` not done. Left out: unchanged.',
  })
  @ValidateIf((_body: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  done?: boolean;
}
