import { ApiProperty } from '@nestjs/swagger';
import { SITUATIONS } from '../situation.js';
// `import type`: a decorated class emits type metadata, and this is only a
// type (the array above is the runtime value).
import type { Situation } from '../situation.js';

/** A struggle as the API answers it: what was said, what was advised, what came of it. */
export class Struggle {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: SITUATIONS })
  situation!: Situation;

  @ApiProperty({ description: 'What you wrote.' })
  description!: string;

  @ApiProperty({
    description: 'A few sentences from the model, in your language.',
  })
  advice!: string;

  @ApiProperty({ description: 'One action, doable in minutes.' })
  nextStep!: string;

  @ApiProperty({
    nullable: true,
    type: Boolean,
    description:
      'Did you continue? Null until you answer with PATCH /api/struggles/{id}.',
  })
  continued!: boolean | null;

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'uuid',
    description:
      'The focus session that was open when you pressed the button, if any.',
  })
  sessionId!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
