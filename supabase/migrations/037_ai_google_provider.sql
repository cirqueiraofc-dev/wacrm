-- ============================================================
-- 037_ai_google_provider.sql
--
-- Allow 'google' (Gemini) as an AI provider. Migrations 029 and 033
-- pinned the provider column to ('openai', 'anthropic') via inline
-- column CHECKs; widen both to include 'google' so accounts can run the
-- assistant on Google Gemini's free API tier.
--
-- Inline column CHECKs get Postgres's default name `<table>_<col>_check`.
-- Drop-and-recreate is the portable way to widen an allow-list CHECK.
-- ============================================================

-- ai_configs.provider (from 029_ai_reply.sql)
ALTER TABLE ai_configs
  DROP CONSTRAINT IF EXISTS ai_configs_provider_check;
ALTER TABLE ai_configs
  ADD CONSTRAINT ai_configs_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'google'));

-- ai_usage_log.provider (from 033_ai_reply_polish.sql)
ALTER TABLE ai_usage_log
  DROP CONSTRAINT IF EXISTS ai_usage_log_provider_check;
ALTER TABLE ai_usage_log
  ADD CONSTRAINT ai_usage_log_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'google'));
