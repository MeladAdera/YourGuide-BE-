import { Injectable, Logger } from '@nestjs/common';
import { AiUsageService } from '../ai/ai-usage.service.js';
import { AiService } from '../ai/ai.service.js';
import { UsersRepository } from '../auth/users.repository.js';
import { ApiError } from '../common/api-error.js';
import { DatabaseService } from '../database/database.service.js';
import { Goal } from '../goals/dto/goal.dto.js';
import { GoalsRepository } from '../goals/goals.repository.js';
import { ProfileService } from '../profile/profile.service.js';
import { ProgressRepository } from '../progress/progress.repository.js';
import { SessionsRepository } from '../sessions/sessions.repository.js';
import { AnswerStruggleDto } from './dto/answer-struggle.dto.js';
import { CreateStruggleDto } from './dto/create-struggle.dto.js';
import { Struggle } from './dto/struggle.dto.js';
import { languageMatches } from '../common/language.js';
import { buildPrompt } from './prompt/build-prompt.js';
import { StrugglesRepository } from './struggles.repository.js';

/** The window the prompt sees: the same the progress page shows by default. */
const PROGRESS_DAYS = 7;
/** How many past struggles the prompt sees. */
const PAST_STRUGGLES = 5;

/**
 * "I'm struggling" is the moment the app exists for. A struggle is what
 * the person said, what the model advised, and later whether they
 * continued. The advice is built from everything the app knows: the
 * profile, the goal, what is being worked on, the last days, the last
 * struggles.
 */
@Injectable()
export class StrugglesService {
  private readonly logger = new Logger(StrugglesService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly usage: AiUsageService,
    private readonly struggles: StrugglesRepository,
    private readonly ai: AiService,
    private readonly profile: ProfileService,
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly goals: GoalsRepository,
    private readonly progress: ProgressRepository,
  ) {}

  /**
   * In this order: is onboarding complete (409)? Is today's limit reached
   * (429, nothing is sent)? Then everything the prompt needs is read in
   * parallel, the model is asked, and only then is the struggle written,
   * so there is never a struggle without its advice: a model failure is a
   * 503 and no row.
   *
   * The model is asked outside the transaction. A call can take many
   * seconds, and a connection held that long for every press would starve
   * the pool. The limit is then checked again inside the transaction that
   * writes the call and the struggle together (`AiUsageService.record`).
   *
   * The session attached is the one open when the button was pressed:
   * what the person was working on at that moment.
   */
  async create(userId: string, input: CreateStruggleDto): Promise<Struggle> {
    const profile = await this.profile.requireComplete(
      userId,
      'struggle.onboarding_required',
    );
    const pool = this.db.pool;
    await this.usage.assertBelowLimit(userId);

    const [user, session, progress, pastStruggles] = await Promise.all([
      this.users.findById(pool, userId),
      this.sessions.findActive(pool, userId),
      this.progress.lastDays(pool, userId, PROGRESS_DAYS),
      this.struggles.listRecent(pool, userId, PAST_STRUGGLES),
    ]);
    if (user === undefined) {
      // The guard found this user a moment ago; only a deletion in between
      // gets here, and then the login is gone.
      throw new ApiError('auth.not_logged_in');
    }
    const goals = await this.goalsFor(userId, session?.goal.id);

    const advice = await this.ai.advise(
      buildPrompt({
        locale: user.locale,
        profile,
        session,
        goals,
        progress,
        pastStruggles,
        situation: input.situation,
        description: input.description,
      }),
    );
    if (!languageMatches(user.locale, `${advice.advice} ${advice.nextStep}`)) {
      // Saved anyway: an answer in the other language still helps, and the
      // log tells us how often the model slips. Nothing of the text here.
      this.logger.warn(`advice language mismatch locale=${user.locale}`);
    }

    return this.usage.record(userId, 'struggle', (client) =>
      this.struggles.create(client, userId, {
        situation: input.situation,
        description: input.description,
        advice: advice.advice,
        nextStep: advice.nextStep,
        sessionId: session?.id ?? null,
      }),
    );
  }

  /**
   * With a session open, its goal alone, in full. Without one, every active
   * goal, which the prompt shows briefly.
   */
  private async goalsFor(
    userId: string,
    sessionGoalId: string | undefined,
  ): Promise<Goal[]> {
    const pool = this.db.pool;
    if (sessionGoalId === undefined) {
      return this.goals.list(pool, userId, false);
    }
    const goal = await this.goals.find(pool, userId, sessionGoalId);
    return goal === undefined ? [] : [goal];
  }

  /**
   * "Did you continue?", answered once. The repository's one UPDATE asks
   * and acts at once; no row means the struggle is not the user's
   * unanswered one, and a second read tells 409 (answered already) from
   * 404 (not theirs, or gone).
   */
  async answer(
    userId: string,
    struggleId: string,
    input: AnswerStruggleDto,
  ): Promise<Struggle> {
    const pool = this.db.pool;
    const answered = await this.struggles.answer(
      pool,
      userId,
      struggleId,
      input.continued,
    );
    if (answered !== undefined) {
      return answered;
    }
    if (await this.struggles.exists(pool, userId, struggleId)) {
      throw new ApiError('struggle.already_answered');
    }
    throw new ApiError('struggle.not_found');
  }
}
