import { ApiProperty } from '@nestjs/swagger';
import { LIFE_VALUES } from './life-values.js';
import type { LifeValue } from './life-values.js';

/** One picked value as the API returns it. */
export class ValuePick {
  @ApiProperty({ enum: LIFE_VALUES })
  value!: LifeValue;

  @ApiProperty({ nullable: true, type: String })
  note!: string | null;
}

/**
 * Screen 7 as the API returns it: the picks (alphabetical, a set not a
 * ranking) and the free text. Optional answers left out are null.
 */
export class Values {
  @ApiProperty({ type: [ValuePick] })
  values!: ValuePick[];

  @ApiProperty()
  personToBecome!: string;

  @ApiProperty({ nullable: true, type: String })
  wouldRegretNotDoing!: string | null;

  @ApiProperty({ nullable: true, type: String })
  rememberedFor!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
