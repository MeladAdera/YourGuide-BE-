import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { Achievements } from './achievements/achievements.dto.js';
import { AchievementsRepository } from './achievements/achievements.repository.js';
import { UpsertAchievementsDto } from './achievements/upsert-achievements.dto.js';
import { Basics } from './basics/basics.dto.js';
import { BasicsRepository } from './basics/basics.repository.js';
import { UpsertBasicsDto } from './basics/upsert-basics.dto.js';
import { Confidence } from './confidence/confidence.dto.js';
import { ConfidenceRepository } from './confidence/confidence.repository.js';
import { UpsertConfidenceDto } from './confidence/upsert-confidence.dto.js';
import { Patterns } from './patterns/patterns.dto.js';
import { PatternsRepository } from './patterns/patterns.repository.js';
import { UpsertPatternsDto } from './patterns/upsert-patterns.dto.js';
import { SelfView } from './self-view/self-view.dto.js';
import { SelfViewRepository } from './self-view/self-view.repository.js';
import { UpsertSelfViewDto } from './self-view/upsert-self-view.dto.js';
import { Situation } from './situation/situation.dto.js';
import { SituationRepository } from './situation/situation.repository.js';
import { UpsertSituationDto } from './situation/upsert-situation.dto.js';
import { MeaningRepository } from './values/meaning.repository.js';
import { UpsertValuesDto } from './values/upsert-values.dto.js';
import { Values } from './values/values.dto.js';
import { ValuesRepository } from './values/values.repository.js';

/**
 * The onboarding screens. Each one is read and saved on its own, so a
 * person can stop half-way and come back. There is no rule here about the
 * order of screens 1–7; the order rule sits where it matters, on saving
 * the direction (screen 8) in ProfileService.
 */
@Injectable()
export class SectionsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly basics: BasicsRepository,
    private readonly situation: SituationRepository,
    private readonly achievements: AchievementsRepository,
    private readonly patterns: PatternsRepository,
    private readonly selfView: SelfViewRepository,
    private readonly confidence: ConfidenceRepository,
    private readonly meaning: MeaningRepository,
    private readonly values: ValuesRepository,
  ) {}

  getBasics(userId: string): Promise<Basics> {
    return saved(this.basics.findByUserId(this.db.pool, userId));
  }

  upsertBasics(userId: string, input: UpsertBasicsDto): Promise<Basics> {
    return this.basics.upsert(this.db.pool, userId, input);
  }

  getSituation(userId: string): Promise<Situation> {
    return saved(this.situation.findByUserId(this.db.pool, userId));
  }

  upsertSituation(
    userId: string,
    input: UpsertSituationDto,
  ): Promise<Situation> {
    return this.situation.upsert(this.db.pool, userId, input);
  }

  getAchievements(userId: string): Promise<Achievements> {
    return saved(this.achievements.findByUserId(this.db.pool, userId));
  }

  upsertAchievements(
    userId: string,
    input: UpsertAchievementsDto,
  ): Promise<Achievements> {
    return this.achievements.upsert(this.db.pool, userId, input);
  }

  getPatterns(userId: string): Promise<Patterns> {
    return saved(this.patterns.findByUserId(this.db.pool, userId));
  }

  upsertPatterns(userId: string, input: UpsertPatternsDto): Promise<Patterns> {
    return this.patterns.upsert(this.db.pool, userId, input);
  }

  getSelfView(userId: string): Promise<SelfView> {
    return saved(this.selfView.findByUserId(this.db.pool, userId));
  }

  upsertSelfView(userId: string, input: UpsertSelfViewDto): Promise<SelfView> {
    return this.selfView.upsert(this.db.pool, userId, input);
  }

  getConfidence(userId: string): Promise<Confidence> {
    return saved(this.confidence.findByUserId(this.db.pool, userId));
  }

  upsertConfidence(
    userId: string,
    input: UpsertConfidenceDto,
  ): Promise<Confidence> {
    return this.confidence.upsert(this.db.pool, userId, input);
  }

  /** Screen 7 is two tables: the free text says whether it is saved. */
  async getValues(userId: string): Promise<Values> {
    const meaning = await saved(
      this.meaning.findByUserId(this.db.pool, userId),
    );
    const values = await this.values.findByUserId(this.db.pool, userId);
    return { ...meaning, values };
  }

  /**
   * One transaction for both tables. Without it, a failure between the
   * two writes would leave a saved free text with no picks, or the old
   * picks deleted and the new ones never inserted.
   */
  upsertValues(userId: string, input: UpsertValuesDto): Promise<Values> {
    return this.db.withTransaction(async (client) => {
      const meaning = await this.meaning.upsert(client, userId, input);
      await this.values.replace(client, userId, input.values);
      const values = await this.values.findByUserId(client, userId);
      return { ...meaning, values };
    });
  }
}

/**
 * Turns "no row" into 404. Not an error in the data: the user has simply
 * not saved this screen yet.
 */
async function saved<T>(lookup: Promise<T | undefined>): Promise<T> {
  const section = await lookup;
  if (section === undefined) {
    throw new NotFoundException('This screen is not saved yet.');
  }
  return section;
}
