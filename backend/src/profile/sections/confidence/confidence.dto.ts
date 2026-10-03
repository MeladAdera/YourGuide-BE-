import { ApiProperty } from '@nestjs/swagger';

/** Screen 6 as the API returns it: the eight answers, nothing derived. */
export class Confidence {
  @ApiProperty({ minimum: 1, maximum: 5 })
  canLearnIfPersist!: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  canTryAgain!: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  followThrough!: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  focusWithoutMotivation!: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  actionsShapeFuture!: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  doubtDespiteEvidence!: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  avoidWhenAfraid!: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  compareTooMuch!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
