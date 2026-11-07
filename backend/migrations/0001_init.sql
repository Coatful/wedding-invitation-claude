-- Wedding replies: the database is the single source of truth.
-- The Google Sheet is a read-only copy rebuilt from the export endpoint.
-- Times are ISO 8601 UTC strings. Nothing in this schema is ever deleted automatically.

-- One row per family reply.
CREATE TABLE replies (
  id            TEXT PRIMARY KEY,               -- reference such as R-7K2M-9QXA (not a secret)
  revision      INTEGER NOT NULL,               -- goes up by one on every saved change
  lang          TEXT NOT NULL CHECK (lang IN ('en', 'zh')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL CHECK (updated_by IN ('guest', 'organizer')),
  write_id      TEXT NOT NULL,                  -- random value of the last successful write (guards multi-step saves)
  email_status  TEXT NOT NULL DEFAULT 'none' CHECK (email_status IN ('none', 'queued', 'sent', 'failed'))
) STRICT;

-- One row per person, so each family member has their own attending / not attending choice.
CREATE TABLE members (
  id         TEXT PRIMARY KEY,                  -- stable per person, such as M-4F7H-2KQD
  reply_id   TEXT NOT NULL REFERENCES replies(id),
  position   INTEGER NOT NULL,
  name       TEXT NOT NULL,
  attending  INTEGER NOT NULL CHECK (attending IN (0, 1)),
  UNIQUE (reply_id, position)
) STRICT;
CREATE INDEX members_by_reply ON members(reply_id);

-- Private edit access. Only SHA-256 hashes are stored, never the links themselves.
--   session:   returned to the browser that saved the reply, for changes straight afterwards
--   email:     the link in the latest emailed copy; valid until guest changes close
--   organizer: made by the couple from the Google Sheet for a guest who asked for a change
CREATE TABLE access_tokens (
  hash        TEXT PRIMARY KEY,
  reply_id    TEXT NOT NULL REFERENCES replies(id),
  kind        TEXT NOT NULL CHECK (kind IN ('session', 'email', 'organizer')),
  created_at  TEXT NOT NULL,
  expires_at  TEXT                              -- NULL: until guest changes close
) STRICT;
CREATE INDEX access_tokens_by_reply ON access_tokens(reply_id, kind);

-- A retried save (for example after a dropped connection) returns the original result.
CREATE TABLE receipts (
  key           TEXT PRIMARY KEY,               -- chosen by the browser for each save
  request_hash  TEXT NOT NULL,
  reply_id      TEXT NOT NULL,
  revision      INTEGER NOT NULL,
  created_at    TEXT NOT NULL
) STRICT;

-- Every saved version, append-only: names and choices only.
CREATE TABLE history (
  reply_id     TEXT NOT NULL,
  revision     INTEGER NOT NULL,
  saved_at     TEXT NOT NULL,
  saved_by     TEXT NOT NULL,
  people_json  TEXT NOT NULL,
  PRIMARY KEY (reply_id, revision)
) STRICT;

-- Email copies waiting to go out. The address is encrypted, and erased once sent or given up on.
CREATE TABLE email_jobs (
  id               TEXT PRIMARY KEY,
  reply_id         TEXT NOT NULL REFERENCES replies(id),
  revision         INTEGER NOT NULL,
  address_enc      TEXT,
  lang             TEXT NOT NULL CHECK (lang IN ('en', 'zh')),
  status           TEXT NOT NULL CHECK (status IN ('queued', 'sending', 'sent', 'failed')),
  attempts         INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  TEXT NOT NULL,
  expires_at       TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  sent_at          TEXT,
  last_error       TEXT
) STRICT;
CREATE INDEX email_jobs_due ON email_jobs(status, next_attempt_at);

-- Abuse control: a count per hashed IP address per 10-minute window. Rows expire after 20 minutes.
CREATE TABLE rate_limits (
  key         TEXT PRIMARY KEY,
  count       INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL                  -- Unix seconds
) STRICT;

-- Local testing only: emails that would have been sent. Never written when ENVIRONMENT is production.
CREATE TABLE dev_outbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL,
  to_address  TEXT NOT NULL,
  subject     TEXT NOT NULL,
  text_body   TEXT NOT NULL,
  html_body   TEXT NOT NULL
) STRICT;
