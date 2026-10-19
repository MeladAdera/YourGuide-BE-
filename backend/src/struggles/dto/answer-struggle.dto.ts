import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/**
 * The answer to "did you continue?", once. A boolean, not an outcome
 * list: the column is a boolean, the progress page reads it as one, and a
 * step's `done` set the pattern for "the client says what happened".
 */
export class AnswerStruggleDto {
  @ApiProperty({
    example: true,
    description: 'true: you continued. false: you stopped.',
  })
  @IsBoolean()
  continued!: boolean;
}
