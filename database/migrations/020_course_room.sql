-- 020: 과목별 강의실 저장 (개설교과목 리스트의 '강의실' 열)
-- 팀티칭 등으로 여러 강의실이 병기되는 경우가 있어 넉넉하게 VARCHAR(200)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS room VARCHAR(200);
ALTER TABLE courses ALTER COLUMN room TYPE VARCHAR(200);
