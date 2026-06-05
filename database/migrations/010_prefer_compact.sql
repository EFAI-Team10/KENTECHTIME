-- 010: 추천 설정 '공강 최소화(compact)' 저장용 컬럼
-- 이 컬럼이 없으면 user_preferences upsert 전체가 실패해
-- 막학기모드/선호영역 등 다른 설정도 함께 저장되지 않음
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS prefer_compact BOOLEAN NOT NULL DEFAULT false;
