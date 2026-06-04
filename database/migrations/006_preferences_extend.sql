-- user_preferences: 추천 설정 필드 추가
-- last_semester: 막학기 모드 (최소 4학점)
-- elective_cats: 자유 영역 선호 카테고리 배열
-- max_credits: 한 학기 최대 수강 학점

ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS last_semester  BOOLEAN       NOT NULL DEFAULT false;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS elective_cats  TEXT[]        NOT NULL DEFAULT '{}';
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS max_credits    INTEGER       NOT NULL DEFAULT 21;
