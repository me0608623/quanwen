-- Phase II.11: LLM call telemetry persistence table
-- Stores metadata for every ZAI LLM call (no prompt/response content — PII-safe)
-- Used for cost tracking, latency analysis, and A/B prompt comparison.

CREATE TABLE IF NOT EXISTS zai_call_log (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  model             VARCHAR(64) NOT NULL,
  prompt_key        VARCHAR(100),
  prompt_version    VARCHAR(32),
  prompt_tokens     INTEGER     NOT NULL DEFAULT 0,
  completion_tokens INTEGER     NOT NULL DEFAULT 0,
  total_tokens      INTEGER     NOT NULL DEFAULT 0,
  latency_ms        INTEGER     NOT NULL DEFAULT 0,
  attempts          INTEGER     NOT NULL DEFAULT 1,
  finish_reason     VARCHAR(32) NOT NULL,
  error_kind        VARCHAR(32),
  cache_hit         BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS zai_call_log_created_idx    ON zai_call_log (created_at);
CREATE INDEX IF NOT EXISTS zai_call_log_prompt_key_idx ON zai_call_log (prompt_key);
CREATE INDEX IF NOT EXISTS zai_call_log_error_idx      ON zai_call_log (error_kind);
