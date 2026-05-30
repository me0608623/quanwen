-- QUA-87: Add sentiment classification to survey responses
-- Used by analyzeSurveySentiment endpoint to store LLM-classified sentiment per response

DO $$ BEGIN
  CREATE TYPE response_sentiment AS ENUM ('positive', 'neutral', 'negative');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS sentiment response_sentiment;
