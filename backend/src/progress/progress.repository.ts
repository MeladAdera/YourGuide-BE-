import { Injectable } from '@nestjs/common';
import { Executor } from '../database/database.service.js';
import { ProgressDay } from './dto/progress.dto.js';

/** One day, as PostgreSQL returns it. The date is text on purpose. */
interface DayRow {
  date: string;
  focus_minutes: number;
  steps_done: number;
  struggled_and_continued: number;
}

/**
 * Every statement names the user. Progress is read, never written: it is
 * what the other tables already say, added up per day.
 */
@Injectable()
export class ProgressRepository {
  /**
   * The last `days` days of the user, today last, in one statement.
   *
   * "Day" means the user's day: every time is turned into the user's
   * timezone (`users.timezone`) before its date is taken. A session at
   * 01:30 in Dubai is 21:30 the day before in UTC, and it counts on the
   * Dubai day.
   *
   * A session counts on the day it started, all of it, even if it ran
   * past midnight. Its minutes are its end minus its start, so a running
   * session adds nothing yet and a stopped one awaiting its review
   * counts. The seconds of a day are added first and rounded to minutes
   * once, so three short sessions do not each lose their odd seconds.
   *
   * `generate_series` makes one row per day, so a day with nothing comes
   * back as zeros and the list always has `days` entries.
   *
   * The three counts look only at rows from the first day on. The first
   * instant of that local day, as an instant, is `date::timestamp AT TIME
   * ZONE timezone`; the (user_id, started_at) index then does the work,
   * however many years of sessions there are.
   *
   * The date comes back as text: pg would turn a `date` into a JavaScript
   * Date at the server's local midnight, and the day could shift.
   */
  async lastDays(
    executor: Executor,
    userId: string,
    days: number,
  ): Promise<ProgressDay[]> {
    const { rows } = await executor.query<DayRow>(
      `WITH me AS (
         SELECT timezone,
                (now() AT TIME ZONE timezone)::date - ($2::int - 1) AS first_day
           FROM users
          WHERE id = $1
       ),
       since AS (
         SELECT (first_day::timestamp AT TIME ZONE timezone) AS at FROM me
       ),
       day AS (
         SELECT generate_series(
                  first_day,
                  (now() AT TIME ZONE timezone)::date,
                  interval '1 day'
                )::date AS date
           FROM me
       ),
       focus AS (
         SELECT (started_at AT TIME ZONE me.timezone)::date AS date,
                sum(extract(epoch FROM ended_at - started_at)) AS seconds
           FROM sessions, me, since
          WHERE sessions.user_id = $1
            AND ended_at IS NOT NULL
            AND started_at >= since.at
          GROUP BY 1
       ),
       done AS (
         SELECT (done_at AT TIME ZONE me.timezone)::date AS date,
                count(*) AS steps
           FROM steps, me, since
          WHERE steps.user_id = $1
            AND done_at >= since.at
          GROUP BY 1
       ),
       continued AS (
         SELECT (created_at AT TIME ZONE me.timezone)::date AS date,
                count(*) AS times
           FROM struggles, me, since
          WHERE struggles.user_id = $1
            AND continued
            AND created_at >= since.at
          GROUP BY 1
       )
       SELECT to_char(day.date, 'YYYY-MM-DD') AS date,
              COALESCE(round(focus.seconds / 60), 0)::int AS focus_minutes,
              COALESCE(done.steps, 0)::int AS steps_done,
              COALESCE(continued.times, 0)::int AS struggled_and_continued
         FROM day
         LEFT JOIN focus ON focus.date = day.date
         LEFT JOIN done ON done.date = day.date
         LEFT JOIN continued ON continued.date = day.date
        ORDER BY day.date`,
      [userId, days],
    );
    return rows.map((row) => ({
      date: row.date,
      focusMinutes: row.focus_minutes,
      stepsDone: row.steps_done,
      struggledAndContinued: row.struggled_and_continued,
    }));
  }
}
