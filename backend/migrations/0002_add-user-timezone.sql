-- Up Migration

-- An IANA timezone name, e.g. 'Asia/Dubai'. Sent by the browser at register.
-- Progress is counted per day in the user's own timezone, not in UTC.
ALTER TABLE users
  ADD COLUMN timezone TEXT NOT NULL;

-- Down Migration

ALTER TABLE users
  DROP COLUMN timezone;
