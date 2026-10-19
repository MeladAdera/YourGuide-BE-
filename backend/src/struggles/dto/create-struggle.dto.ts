import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { Answer } from '../../common/answer.decorator.js';
import { SITUATIONS } from '../situation.js';
// `import type`: a decorated class emits type metadata, and this is only a
// type (the array above is the runtime value).
import type { Situation } from '../situation.js';

/**
 * "I'm struggling": which kind of moment, and what is happening in the
 * person's own words. Nothing else. The session is not sent: the server
 * attaches the one that is open, so a stale tab cannot link a struggle to
 * the wrong session.
 */
export class CreateStruggleDto {
  @ApiProperty({
    enum: SITUATIONS,
    example: 'stuck',
    description:
      'Which kind of moment: stuck, tired, comparing yourself with others, or a negative thought.',
  })
  @IsIn(SITUATIONS)
  situation!: Situation;

  @Answer({
    example:
      'I have read the same JOIN explanation three times and still cannot write the query.',
    description: 'What is happening, in your own words.',
  })
  description!: string;
}
