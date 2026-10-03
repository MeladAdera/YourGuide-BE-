-- Up Migration

-- Onboarding is eight screens. Screens 1–7 get one table each, so a screen
-- can be saved on its own and "required on this screen" is NOT NULL.
-- Screen 8 (your direction) is the existing profiles table. SCHEMA.md §5.

-- Screen 8: the first outcome is optional; completed_at marks when
-- onboarding was finished and is never updated afterwards.
ALTER TABLE profiles
  ADD COLUMN first_outcome TEXT,
  ADD COLUMN completed_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Screen 1: basics. Only the employment status is required.
CREATE TABLE profile_basics (
  user_id UUID PRIMARY KEY
    REFERENCES users(id)
    ON DELETE CASCADE,
  employment_status TEXT NOT NULL
    CHECK (
      employment_status IN (
        'student',
        'employed',
        'self_employed',
        'between_jobs',
        'caregiver',
        'retired',
        'other'
      )
    ),
  age_range TEXT
    CHECK (
      age_range IN (
        'under_18',
        '18_24',
        '25_34',
        '35_44',
        '45_54',
        '55_plus'
      )
    ),
  -- ISO 3166-1 alpha-2, e.g. 'AE'. Country only, never a city or address.
  country TEXT
    CHECK (country ~ '^[A-Z]{2}$'),
  education_level TEXT
    CHECK (
      education_level IN (
        'secondary',
        'vocational',
        'bachelor',
        'master',
        'doctorate',
        'other'
      )
    ),
  occupation TEXT,
  years_experience TEXT
    CHECK (
      years_experience IN (
        'none',
        'under_2',
        '2_5',
        '6_10',
        'over_10'
      )
    ),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Screen 2: your days now.
CREATE TABLE profile_situation (
  user_id UUID PRIMARY KEY
    REFERENCES users(id)
    ON DELETE CASCADE,
  typical_day TEXT NOT NULL,
  want_to_change TEXT NOT NULL,
  satisfied_with TEXT,
  wish_more_time_for TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Screen 3: what you have done.
CREATE TABLE profile_achievements (
  user_id UUID PRIMARY KEY
    REFERENCES users(id)
    ON DELETE CASCADE,
  proud_of TEXT NOT NULL,
  what_was_hard TEXT,
  learned_about_self TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Screen 4: what gets in the way.
CREATE TABLE profile_patterns (
  user_id UUID PRIMARY KEY
    REFERENCES users(id)
    ON DELETE CASCADE,
  often_postpone TEXT NOT NULL,
  lesson_from_mistake TEXT,
  pattern_to_change TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Screen 5: how you see yourself.
CREATE TABLE profile_self_view (
  user_id UUID PRIMARY KEY
    REFERENCES users(id)
    ON DELETE CASCADE,
  who_i_am TEXT NOT NULL,
  good_at TEXT,
  others_come_to_me_for TEXT,
  still_figuring_out TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Screen 6: quick check-in. Eight statements, each 1 (strongly disagree)
-- to 5 (strongly agree). Answers only: no total, no score, no label.
CREATE TABLE profile_confidence (
  user_id UUID PRIMARY KEY
    REFERENCES users(id)
    ON DELETE CASCADE,
  can_learn_if_persist SMALLINT NOT NULL
    CHECK (can_learn_if_persist BETWEEN 1 AND 5),
  can_try_again SMALLINT NOT NULL
    CHECK (can_try_again BETWEEN 1 AND 5),
  follow_through SMALLINT NOT NULL
    CHECK (follow_through BETWEEN 1 AND 5),
  focus_without_motivation SMALLINT NOT NULL
    CHECK (focus_without_motivation BETWEEN 1 AND 5),
  actions_shape_future SMALLINT NOT NULL
    CHECK (actions_shape_future BETWEEN 1 AND 5),
  doubt_despite_evidence SMALLINT NOT NULL
    CHECK (doubt_despite_evidence BETWEEN 1 AND 5),
  avoid_when_afraid SMALLINT NOT NULL
    CHECK (avoid_when_afraid BETWEEN 1 AND 5),
  compare_too_much SMALLINT NOT NULL
    CHECK (compare_too_much BETWEEN 1 AND 5),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Screen 7: what matters to you. The free text...
CREATE TABLE profile_meaning (
  user_id UUID PRIMARY KEY
    REFERENCES users(id)
    ON DELETE CASCADE,
  person_to_become TEXT NOT NULL,
  would_regret_not_doing TEXT,
  remembered_for TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ...and the picks: two to five values per user, each with an optional note.
-- The only onboarding answer with many rows per user.
CREATE TABLE profile_values (
  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,
  value TEXT NOT NULL
    CHECK (
      value IN (
        'family',
        'health',
        'career',
        'learning',
        'contribution',
        'financial_security',
        'creativity',
        'relationships',
        'spirituality',
        'independence'
      )
    ),
  note TEXT,
  PRIMARY KEY (user_id, value)
);

-- Down Migration

DROP TABLE profile_values;
DROP TABLE profile_meaning;
DROP TABLE profile_confidence;
DROP TABLE profile_self_view;
DROP TABLE profile_patterns;
DROP TABLE profile_achievements;
DROP TABLE profile_situation;
DROP TABLE profile_basics;

ALTER TABLE profiles
  DROP COLUMN completed_at,
  DROP COLUMN first_outcome;
