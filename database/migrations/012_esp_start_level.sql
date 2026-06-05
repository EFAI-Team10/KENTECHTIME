-- 012: ESP 시작 레벨 저장 (1: Foundation 1, 2: Foundation 2, 3: Intermediate)
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS esp_start_level SMALLINT NOT NULL DEFAULT 1;
