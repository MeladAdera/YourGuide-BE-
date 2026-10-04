import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { Answer, MAX_NOTE } from '../../../common/answer.decorator.js';
import { LIFE_VALUES, MAX_VALUES, MIN_VALUES } from './life-values.js';
import type { LifeValue } from './life-values.js';

/** One picked value, with an optional note on why it matters. */
export class ValuePickDto {
  @ApiProperty({ enum: LIFE_VALUES, example: 'learning' })
  @IsIn(LIFE_VALUES)
  value!: LifeValue;

  @Answer({
    example: 'Learning is the one thing nobody can take back.',
    description: 'Why this one matters to you.',
    max: MAX_NOTE,
    optional: true,
  })
  note?: string | null;
}

/** What `@ArrayUnique` compares: the value of a pick, if it is a pick. */
function pickValue(pick: unknown): unknown {
  return typeof pick === 'object' && pick !== null && 'value' in pick
    ? pick.value
    : pick;
}

/**
 * Screen 7, what matters to you: two to five values from a fixed list,
 * and the person they want to become. The answers here are half of the
 * "why" behind the goal on screen 8.
 */
export class UpsertValuesDto {
  @ApiProperty({
    type: [ValuePickDto],
    minItems: MIN_VALUES,
    maxItems: MAX_VALUES,
    description: `${String(MIN_VALUES)} to ${String(MAX_VALUES)} areas that matter most, each picked once. A set, not a ranking.`,
    // Its own example, with different values. Without one, Swagger builds
    // the list by repeating the single example pick, which this very rule
    // refuses: the pre-filled body could never be saved.
    example: [
      {
        value: 'learning',
        note: 'Learning is the one thing nobody can take back.',
      },
      { value: 'health' },
      { value: 'independence', note: 'Deciding my own hours.' },
    ],
  })
  @IsArray()
  @ArrayMinSize(MIN_VALUES)
  @ArrayMaxSize(MAX_VALUES)
  @ArrayUnique(pickValue, { message: 'Each value can be picked only once.' })
  @ValidateNested({ each: true })
  @Type(() => ValuePickDto)
  values!: ValuePickDto[];

  @Answer({
    example:
      'Someone who finishes what he starts and is honest about what he does not know.',
    description: 'What kind of person do you want to become?',
  })
  personToBecome!: string;

  @Answer({
    example: 'Never building something of my own.',
    description: 'What would you regret not doing?',
    optional: true,
  })
  wouldRegretNotDoing?: string | null;

  @Answer({
    example: 'That I helped people get unstuck.',
    description: 'What do you want people to remember about you?',
    optional: true,
  })
  rememberedFor?: string | null;
}
